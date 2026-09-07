<?php

namespace App\Services\Inventory;

use App\Enums\SimpleDocStatus as S;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\Adjustment;
use App\Models\User;
use App\Services\Purchasing\LineItems;
use Illuminate\Support\Facades\DB;

class AdjustmentService
{
    public function __construct(private readonly InventoryService $inventory) {}

    public function save(?Adjustment $adjustment, array $data, User $user): Adjustment
    {
        if ($adjustment && ! $adjustment->status->isEditable()) {
            throw new DomainException('Solo se pueden editar ajustes en borrador.');
        }
        if ($adjustment && $adjustment->stock_count_id) {
            throw new DomainException('Los ajustes generados por un conteo no se editan manualmente.');
        }

        return DB::transaction(function () use ($adjustment, $data, $user) {
            $attrs = [
                'warehouse_id' => $data['warehouse_id'],
                'date' => $data['date'],
                'reason' => $data['reason'] ?? 'correccion',
                'notes' => $data['notes'] ?? null,
            ];

            if ($adjustment) {
                $adjustment->fill($attrs)->save();
            } else {
                $adjustment = Adjustment::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $products = LineItems::productsFor($data['items']);
            LineItems::sync($adjustment->items(), $data['items'], function (array $line) use ($products) {
                $product = $products->get((int) $line['product_id'])
                    ?? throw new DomainException('Producto no encontrado.');
                $qty = (float) $line['qty_base'];
                if (abs($qty) < 0.0005) {
                    throw new DomainException("La cantidad de {$product->name} no puede ser cero.");
                }

                return [
                    'product_id' => $product->id,
                    'qty_base' => $qty,
                    'unit_cost' => isset($line['unit_cost']) && $line['unit_cost'] !== null && $line['unit_cost'] !== '' ? (float) $line['unit_cost'] : null,
                    'notes' => $line['notes'] ?? null,
                ];
            });

            return $adjustment->refresh();
        });
    }

    public function confirm(Adjustment $adjustment, User $user): Adjustment
    {
        $this->assertStatus($adjustment, [S::Borrador], 'confirmar');
        if ($adjustment->items()->count() === 0) {
            throw new DomainException('El ajuste no tiene ítems.');
        }

        return DB::transaction(function () use ($adjustment, $user) {
            foreach ($adjustment->items()->get() as $item) {
                $qty = (float) $item->qty_base;
                $movement = $this->inventory->move(
                    $adjustment->warehouse_id,
                    $item->product_id,
                    $qty > 0 ? StockMovementType::AjusteEntrada : StockMovementType::AjusteSalida,
                    abs($qty),
                    $qty > 0 ? ($item->unit_cost !== null ? (float) $item->unit_cost : null) : null,
                    $adjustment,
                    $user,
                    $adjustment->date?->setTimeFrom(now()),
                    "Ajuste {$adjustment->number} · ".(Adjustment::REASONS[$adjustment->reason] ?? $adjustment->reason),
                );
                // Guardar el costo efectivamente usado (para salidas: el promedio).
                if ($item->unit_cost === null) {
                    $item->forceFill(['unit_cost' => (float) $movement->unit_cost])->save();
                }
            }
            $adjustment->forceFill(['status' => S::Confirmado, 'confirmed_at' => now()])->save();

            return $adjustment;
        });
    }

    public function cancel(Adjustment $adjustment, User $user): Adjustment
    {
        $this->assertStatus($adjustment, [S::Borrador, S::Confirmado], 'anular');

        return DB::transaction(function () use ($adjustment, $user) {
            if ($adjustment->status === S::Confirmado) {
                $this->inventory->reverse($adjustment, $user, "Anulación de ajuste {$adjustment->number}");
            }
            $adjustment->forceFill(['status' => S::Anulado])->save();

            return $adjustment;
        });
    }

    private function assertStatus(Adjustment $adjustment, array $allowed, string $action): void
    {
        if (! in_array($adjustment->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} un ajuste en estado \"{$adjustment->status->label()}\".");
        }
    }
}
