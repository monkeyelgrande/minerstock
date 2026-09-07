<?php

namespace App\Services\Inventory;

use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\StockMovement;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Único punto por el que cambia el stock (kardex + saldos con costo promedio ponderado).
 * Todos los documentos confirmados llaman a `move()` dentro de su propia transacción.
 */
class InventoryService
{
    /**
     * Registra un movimiento y actualiza el saldo de la bodega.
     *
     * @param  float  $qtyBase  cantidad en unidad base; el signo lo define el tipo (entrada +, salida −)
     * @param  float|null  $unitCost  costo unitario base. Entradas: obligatorio (si null usa el promedio actual).
     *                                Salidas: null → costo promedio actual; explícito solo para devoluciones a proveedor.
     */
    public function move(
        int $warehouseId,
        int $productId,
        StockMovementType $type,
        float $qtyBase,
        ?float $unitCost,
        Model $source,
        User $user,
        ?CarbonInterface $movedAt = null,
        ?string $notes = null,
        bool $isReversal = false,
    ): StockMovement {
        if ($qtyBase <= 0) {
            throw new DomainException('La cantidad del movimiento debe ser mayor que cero.');
        }

        return DB::transaction(function () use ($warehouseId, $productId, $type, $qtyBase, $unitCost, $source, $user, $movedAt, $notes, $isReversal) {
            /** @var StockBalance $balance */
            $balance = StockBalance::query()
                ->where('warehouse_id', $warehouseId)->where('product_id', $productId)
                ->lockForUpdate()->first()
                ?? StockBalance::query()->create(['warehouse_id' => $warehouseId, 'product_id' => $productId]);

            $currentQty = (float) $balance->qty;
            $currentAvg = (float) $balance->avg_cost;
            $inbound = $type->isInbound();
            // Un movimiento de reversa invierte el sentido natural del tipo.
            if ($isReversal) {
                $inbound = ! $inbound;
            }

            if ($inbound) {
                $cost = $unitCost ?? $currentAvg;
                $newQty = $currentQty + $qtyBase;
                $newAvg = $newQty > 0
                    ? round((($currentQty * $currentAvg) + ($qtyBase * $cost)) / $newQty, 4)
                    : $cost;
                $signedQty = $qtyBase;
            } else {
                if ($currentQty + 0.0005 < $qtyBase) {
                    $product = Product::query()->find($productId);
                    throw new DomainException(sprintf(
                        'Stock insuficiente de %s: disponible %s, requerido %s.',
                        $product?->name ?? "producto #{$productId}",
                        $this->fmt($currentQty),
                        $this->fmt($qtyBase),
                    ));
                }
                $cost = $unitCost ?? $currentAvg;
                $newQty = $currentQty - $qtyBase;
                $newAvg = $newQty > 0.0005 ? $currentAvg : 0.0;
                $signedQty = -$qtyBase;
            }

            $movement = StockMovement::query()->create([
                'warehouse_id' => $warehouseId,
                'product_id' => $productId,
                'type' => $type,
                'qty_base' => $signedQty,
                'unit_cost' => round($cost, 4),
                'total_cost' => round($qtyBase * $cost, 2),
                'balance_qty_after' => round($newQty, 3),
                'balance_cost_after' => $newAvg,
                'source_type' => $source->getMorphClass(),
                'source_id' => $source->getKey(),
                'is_reversal' => $isReversal,
                'moved_at' => $movedAt ?? now(),
                'user_id' => $user->id,
                'notes' => $notes,
            ]);

            $balance->forceFill([
                'qty' => round($newQty, 3),
                'avg_cost' => $newAvg,
                'last_movement_at' => $movement->moved_at,
            ])->save();

            return $movement;
        });
    }

    /**
     * Reversa todos los movimientos de un documento (al anularlo).
     * Cada movimiento original genera uno opuesto con `is_reversal = true`.
     */
    public function reverse(Model $source, User $user, string $notes): void
    {
        $movements = StockMovement::query()
            ->where('source_type', $source->getMorphClass())
            ->where('source_id', $source->getKey())
            ->where('is_reversal', false)
            ->orderBy('id')
            ->get();

        foreach ($movements as $m) {
            $this->move(
                $m->warehouse_id,
                $m->product_id,
                $m->type,
                abs((float) $m->qty_base),
                (float) $m->unit_cost,
                $source,
                $user,
                now(),
                $notes,
                true,
            );
        }
    }

    public function balanceOf(int $warehouseId, int $productId): ?StockBalance
    {
        return StockBalance::query()->where('warehouse_id', $warehouseId)->where('product_id', $productId)->first();
    }

    private function fmt(float $n): string
    {
        return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.');
    }
}
