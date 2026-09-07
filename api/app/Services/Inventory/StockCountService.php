<?php

namespace App\Services\Inventory;

use App\Enums\StockCountStatus as S;
use App\Exceptions\DomainException;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\StockCount;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockCountService
{
    public function __construct(private readonly AdjustmentService $adjustments) {}

    /**
     * Abre un conteo. `scope`: 'all' (todos los productos con saldo en la bodega),
     * 'category' (por categoría) o 'products' (lista explícita). Toma foto del saldo del sistema.
     */
    public function open(array $data, User $user): StockCount
    {
        return DB::transaction(function () use ($data, $user) {
            $count = StockCount::query()->create([
                'warehouse_id' => $data['warehouse_id'],
                'date' => $data['date'],
                'counted_by' => $data['counted_by'] ?? $user->id,
                'notes' => $data['notes'] ?? null,
                'created_by' => $user->id,
                'status' => S::EnProceso,
            ]);

            $this->addProducts($count, $this->resolveProductIds($data));

            if ($count->items()->count() === 0) {
                throw new DomainException('No hay productos para contar con los criterios indicados.');
            }

            return $count->refresh();
        });
    }

    /** Agrega productos a un conteo abierto (con saldo actual del sistema). */
    public function addProducts(StockCount $count, array $productIds): void
    {
        $this->assertOpen($count);
        $existing = $count->items()->pluck('product_id')->all();
        $balances = StockBalance::query()->where('warehouse_id', $count->warehouse_id)
            ->whereIn('product_id', $productIds)->pluck('qty', 'product_id');

        foreach (array_unique($productIds) as $pid) {
            if (in_array($pid, $existing, true)) {
                continue;
            }
            $count->items()->create(['product_id' => $pid, 'system_qty' => (float) ($balances[$pid] ?? 0)]);
        }
    }

    /** Registra cantidades contadas: [{product_id, counted_qty, notes}]. */
    public function record(StockCount $count, array $lines): StockCount
    {
        $this->assertOpen($count);

        DB::transaction(function () use ($count, $lines) {
            foreach ($lines as $line) {
                $count->items()->where('product_id', (int) $line['product_id'])->update([
                    'counted_qty' => $line['counted_qty'] === null || $line['counted_qty'] === '' ? null : (float) $line['counted_qty'],
                    'notes' => $line['notes'] ?? null,
                ]);
            }
        });

        return $count->refresh();
    }

    /** Cierra el conteo: genera y confirma un ajuste con las diferencias. */
    public function close(StockCount $count, User $user): StockCount
    {
        $this->assertOpen($count);
        $items = $count->items()->with('product')->get();
        if ($items->whereNull('counted_qty')->isNotEmpty()) {
            throw new DomainException('Hay productos sin cantidad contada. Regístralos o quítalos antes de cerrar.');
        }

        return DB::transaction(function () use ($count, $items, $user) {
            // Refrescar el saldo del sistema al momento de cerrar para no ajustar sobre una foto vieja.
            $balances = StockBalance::query()->where('warehouse_id', $count->warehouse_id)
                ->whereIn('product_id', $items->pluck('product_id'))->pluck('qty', 'product_id');

            $lines = [];
            foreach ($items as $item) {
                $system = (float) ($balances[$item->product_id] ?? 0);
                $item->forceFill(['system_qty' => $system])->save();
                $diff = round((float) $item->counted_qty - $system, 3);
                if (abs($diff) >= 0.0005) {
                    $lines[] = ['product_id' => $item->product_id, 'qty_base' => $diff, 'notes' => $item->notes];
                }
            }

            $adjustmentId = null;
            if ($lines) {
                $adjustment = $this->adjustments->save(null, [
                    'warehouse_id' => $count->warehouse_id,
                    'date' => $count->date->format('Y-m-d'),
                    'reason' => 'conteo',
                    'notes' => "Diferencias del conteo {$count->number}",
                    'items' => $lines,
                ], $user);
                $adjustment->forceFill(['stock_count_id' => $count->id])->save();
                $this->adjustments->confirm($adjustment, $user);
                $adjustmentId = $adjustment->id;
            }

            $count->forceFill(['status' => S::Cerrado, 'closed_at' => now(), 'adjustment_id' => $adjustmentId])->save();

            return $count;
        });
    }

    public function cancel(StockCount $count): StockCount
    {
        $this->assertOpen($count);
        $count->forceFill(['status' => S::Anulado])->save();

        return $count;
    }

    public function removeProduct(StockCount $count, int $productId): void
    {
        $this->assertOpen($count);
        $count->items()->where('product_id', $productId)->delete();
    }

    private function resolveProductIds(array $data): array
    {
        $scope = $data['scope'] ?? 'all';

        if ($scope === 'products') {
            return array_map('intval', $data['product_ids'] ?? []);
        }

        $query = StockBalance::query()->where('warehouse_id', $data['warehouse_id'])->where('qty', '>', 0);
        if ($scope === 'category' && ! empty($data['category_id'])) {
            $query->whereIn('product_id', Product::query()->where('category_id', $data['category_id'])->pluck('id'));
        }

        return $query->pluck('product_id')->map(fn ($id) => (int) $id)->all();
    }

    private function assertOpen(StockCount $count): void
    {
        if ($count->status !== S::EnProceso) {
            throw new DomainException("El conteo {$count->number} ya está {$count->status->label()}.");
        }
    }
}
