<?php

namespace App\Services\Consumption;

use App\Enums\LoanStatus as L;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\Loan;
use App\Models\LoanReturn;
use App\Models\Product;
use App\Models\User;
use App\Services\Inventory\AdjustmentService;
use App\Services\Inventory\InventoryService;
use App\Services\Purchasing\LineItems;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class LoanService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly AdjustmentService $adjustments,
    ) {}

    public function save(?Loan $loan, array $data, User $user): Loan
    {
        if ($loan && ! $loan->status->isEditable()) {
            throw new DomainException('Solo se pueden editar préstamos en borrador.');
        }

        return DB::transaction(function () use ($loan, $data, $user) {
            $attrs = [
                'warehouse_id' => $data['warehouse_id'],
                'recipient_id' => $data['recipient_id'],
                'loaned_at' => $data['loaned_at'],
                'expected_return_at' => $data['expected_return_at'] ?? null,
                'notes' => $data['notes'] ?? null,
            ];

            if ($loan) {
                $loan->fill($attrs)->save();
            } else {
                $loan = Loan::query()->create($attrs + ['created_by' => $user->id, 'status' => L::Borrador]);
            }

            $products = LineItems::productsFor($data['items']);
            LineItems::sync($loan->items(), $data['items'], function (array $line) use ($products) {
                $product = $products->get((int) $line['product_id'])
                    ?? throw new DomainException('Producto no encontrado.');
                if ($product->kind !== Product::KIND_RETORNABLE) {
                    throw new DomainException("Solo se prestan productos retornables; {$product->name} no lo es.");
                }
                $qty = (float) $line['qty_base'];
                if ($qty <= 0) {
                    throw new DomainException("La cantidad de {$product->name} debe ser mayor que cero.");
                }

                return [
                    'product_id' => $product->id,
                    'qty_base' => $qty,
                    'notes' => $line['notes'] ?? null,
                ];
            });

            return $loan->refresh();
        });
    }

    public function confirm(Loan $loan, User $user): Loan
    {
        $this->assertStatus($loan, [L::Borrador], 'confirmar');
        if ($loan->items()->count() === 0) {
            throw new DomainException('El préstamo no tiene ítems.');
        }

        return DB::transaction(function () use ($loan, $user) {
            foreach ($loan->items()->get() as $item) {
                $movement = $this->inventory->move(
                    $loan->warehouse_id,
                    $item->product_id,
                    StockMovementType::PrestamoSalida,
                    (float) $item->qty_base,
                    null,
                    $loan,
                    $user,
                    $loan->loaned_at?->setTimeFrom(now()),
                    "Préstamo {$loan->number} · {$loan->recipient?->name}",
                );
                $item->forceFill(['unit_cost' => (float) $movement->unit_cost])->save();
            }
            $loan->forceFill(['status' => L::Abierto, 'confirmed_at' => now()])->save();

            return $loan;
        });
    }

    /**
     * Registra una devolución (queda confirmada de una vez).
     * Bueno y dañado reingresan al stock al costo del préstamo; dañado además genera
     * un ajuste de salida confirmado con motivo `devolucion_prestamo_danada`.
     * Perdido no genera entrada (el stock ya salió con el préstamo).
     */
    public function registerReturn(Loan $loan, array $data, User $user): LoanReturn
    {
        if (! $loan->status->isOpen()) {
            throw new DomainException("No se pueden registrar devoluciones de un préstamo en estado \"{$loan->status->label()}\".");
        }

        return DB::transaction(function () use ($loan, $data, $user) {
            $items = $loan->items()->with('product')->get()->keyBy('id');

            // Total por ítem en esta devolución, validado contra el saldo prestado.
            $byItem = [];
            foreach ($data['items'] as $line) {
                $item = $items->get((int) $line['loan_item_id'])
                    ?? throw new DomainException('El ítem no pertenece a este préstamo.');
                $byItem[$item->id] = ($byItem[$item->id] ?? 0) + (float) $line['qty_base'];
            }
            foreach ($byItem as $itemId => $qty) {
                $item = $items->get($itemId);
                if ($qty - 0.0005 > $item->outstandingBase()) {
                    throw new DomainException(sprintf(
                        'La devolución de %s supera lo prestado: en poder del receptor %s.',
                        $item->product->name,
                        rtrim(rtrim(number_format($item->outstandingBase(), 3, '.', ''), '0'), '.'),
                    ));
                }
            }

            $return = LoanReturn::query()->create([
                'loan_id' => $loan->id,
                'returned_at' => $data['returned_at'],
                'received_by' => $user->id,
                'notes' => $data['notes'] ?? null,
            ]);

            $damaged = [];
            foreach ($data['items'] as $line) {
                $item = $items->get((int) $line['loan_item_id']);
                $qty = (float) $line['qty_base'];
                $condition = $line['condition'];

                $return->items()->create([
                    'loan_item_id' => $item->id,
                    'qty_base' => $qty,
                    'condition' => $condition,
                    'notes' => $line['notes'] ?? null,
                ]);

                if (in_array($condition, ['bueno', 'dañado'], true)) {
                    $this->inventory->move(
                        $loan->warehouse_id,
                        $item->product_id,
                        StockMovementType::DevolucionPrestamoEntrada,
                        $qty,
                        (float) $item->unit_cost,
                        $return,
                        $user,
                        $return->returned_at?->setTimeFrom(now()),
                        "Devolución de préstamo {$loan->number}".($condition === 'dañado' ? ' (dañada)' : ''),
                    );
                }

                $column = match ($condition) {
                    'bueno' => 'qty_returned_base',
                    'dañado' => 'qty_damaged_base',
                    'perdido' => 'qty_lost_base',
                };
                $item->forceFill([$column => (float) $item->{$column} + $qty])->save();

                if ($condition === 'dañado') {
                    $damaged[] = ['product_id' => $item->product_id, 'qty_base' => -$qty, 'notes' => "Préstamo {$loan->number}"];
                }
            }

            // Lo dañado entra y sale en el mismo acto: queda trazado en el kardex sin inflar el stock.
            if ($damaged !== []) {
                $adjustment = $this->adjustments->save(null, [
                    'warehouse_id' => $loan->warehouse_id,
                    'date' => $data['returned_at'],
                    'reason' => 'devolucion_prestamo_danada',
                    'notes' => "Generado por devolución del préstamo {$loan->number}",
                    'items' => $damaged,
                ], $user);
                $this->adjustments->confirm($adjustment, $user);
            }

            $this->recalcStatus($loan);

            return $return;
        });
    }

    public function cancel(Loan $loan, User $user): Loan
    {
        $this->assertStatus($loan, [L::Borrador, L::Abierto], 'anular');
        if ($loan->returns()->exists()) {
            throw new DomainException('El préstamo ya tiene devoluciones registradas; no se puede anular.');
        }

        return DB::transaction(function () use ($loan, $user) {
            if ($loan->status === L::Abierto) {
                $this->inventory->reverse($loan, $user, "Anulación de préstamo {$loan->number}");
            }
            $loan->forceFill(['status' => L::Anulado])->save();

            return $loan;
        });
    }

    /**
     * Saldo en préstamo agrupado por receptor → productos (herramientas por persona).
     */
    public function holdings(?int $warehouseId, User $user): Collection
    {
        $loans = Loan::query()
            ->with(['recipient', 'warehouse', 'items.product.baseUnit'])
            ->whereIn('status', [L::Abierto, L::Parcial])
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->visibleTo($user)
            ->get();

        return $loans
            ->groupBy('recipient_id')
            ->map(function (Collection $group) {
                $recipient = $group->first()->recipient;
                $products = [];
                foreach ($group as $loan) {
                    foreach ($loan->items as $item) {
                        $outstanding = $item->outstandingBase();
                        if ($outstanding <= 0) {
                            continue;
                        }
                        $key = $item->product_id;
                        $products[$key] ??= [
                            'product' => [
                                'id' => $item->product->id,
                                'sku' => $item->product->sku,
                                'name' => $item->product->name,
                                'base_unit' => $item->product->baseUnit?->code,
                            ],
                            'qty_base' => 0.0,
                            'value' => 0.0,
                            'loans' => [],
                        ];
                        $products[$key]['qty_base'] += $outstanding;
                        $products[$key]['value'] += round($outstanding * (float) $item->unit_cost, 2);
                        $products[$key]['loans'][] = [
                            'id' => $loan->id,
                            'number' => $loan->number,
                            'loaned_at' => $loan->loaned_at?->format('Y-m-d'),
                            'expected_return_at' => $loan->expected_return_at?->format('Y-m-d'),
                            'is_overdue' => $loan->isOverdue(),
                            'qty_base' => $outstanding,
                        ];
                    }
                }

                $products = array_values($products);

                return [
                    'recipient' => [
                        'id' => $recipient->id,
                        'name' => $recipient->name,
                        'type' => $recipient->type,
                        'document_number' => $recipient->document_number,
                    ],
                    'items' => $products,
                    'total_qty' => round(array_sum(array_column($products, 'qty_base')), 3),
                    'total_value' => round(array_sum(array_column($products, 'value')), 2),
                    'has_overdue' => $group->contains(fn (Loan $l) => $l->isOverdue()),
                ];
            })
            ->filter(fn (array $row) => $row['items'] !== [])
            ->sortBy(fn (array $row) => $row['recipient']['name'])
            ->values();
    }

    /** Saldo en préstamo por producto (para la matriz de stock), indexado por product_id. */
    public function onLoanByProduct(?int $warehouseId = null): array
    {
        return Loan::query()
            ->whereIn('status', [L::Abierto, L::Parcial])
            ->when($warehouseId, fn ($q) => $q->where('warehouse_id', $warehouseId))
            ->with('items')
            ->get()
            ->flatMap(fn (Loan $loan) => $loan->items->map(fn ($item) => [
                'product_id' => $item->product_id,
                'qty' => $item->outstandingBase(),
                'value' => round($item->outstandingBase() * (float) $item->unit_cost, 2),
            ]))
            ->filter(fn (array $row) => $row['qty'] > 0)
            ->groupBy('product_id')
            ->map(fn (Collection $rows) => [
                'qty' => round($rows->sum('qty'), 3),
                'value' => round($rows->sum('value'), 2),
            ])
            ->all();
    }

    private function recalcStatus(Loan $loan): void
    {
        $items = $loan->items()->get();
        $outstanding = $items->sum(fn ($i) => $i->outstandingBase());
        $lost = $items->sum(fn ($i) => (float) $i->qty_lost_base);

        $status = $outstanding <= 0.0005
            ? ($lost > 0 ? L::CerradoConPerdida : L::Devuelto)
            : L::Parcial;

        $loan->forceFill(['status' => $status])->save();
    }

    private function assertStatus(Loan $loan, array $allowed, string $action): void
    {
        if (! in_array($loan->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} un préstamo en estado \"{$loan->status->label()}\".");
        }
    }
}
