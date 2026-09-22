<?php

namespace App\Services\Consumption;

use App\Enums\SimpleDocStatus as S;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\Issue;
use App\Models\Recipient;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use App\Services\Purchasing\LineItems;
use Illuminate\Support\Facades\DB;

class IssueService
{
    public function __construct(private readonly InventoryService $inventory) {}

    public function save(?Issue $issue, array $data, User $user): Issue
    {
        if ($issue && ! $issue->status->isEditable()) {
            throw new DomainException('Solo se pueden editar vales en borrador.');
        }

        return DB::transaction(function () use ($issue, $data, $user) {
            $recipient = Recipient::query()->findOrFail($data['recipient_id']);
            $attrs = [
                'warehouse_id' => $data['warehouse_id'],
                'recipient_id' => $recipient->id,
                // Sin centro de costo explícito se usa el del receptor.
                'cost_center_id' => $data['cost_center_id'] ?? $recipient->cost_center_id,
                'date' => $data['date'],
                'notes' => $data['notes'] ?? null,
            ];

            if ($issue) {
                $issue->fill($attrs)->save();
            } else {
                $issue = Issue::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $products = LineItems::productsFor($data['items']);
            LineItems::sync($issue->items(), $data['items'], function (array $line) use ($products) {
                $product = $products->get((int) $line['product_id'])
                    ?? throw new DomainException('Producto no encontrado.');
                $factor = LineItems::factorFor($product, (int) $line['unit_id']);
                $qty = (float) $line['quantity'];
                if ($qty <= 0) {
                    throw new DomainException("La cantidad de {$product->name} debe ser mayor que cero.");
                }

                return [
                    'product_id' => $product->id,
                    'unit_id' => (int) $line['unit_id'],
                    'factor' => $factor,
                    'quantity' => $qty,
                    'qty_base' => round($qty * $factor, 3),
                    'notes' => $line['notes'] ?? null,
                ];
            });

            return $issue->refresh();
        });
    }

    public function confirm(Issue $issue, User $user): Issue
    {
        $this->assertStatus($issue, [S::Borrador], 'confirmar');
        if ($issue->items()->count() === 0) {
            throw new DomainException('El vale no tiene ítems.');
        }

        return DB::transaction(function () use ($issue, $user) {
            foreach ($issue->items()->get() as $item) {
                $movement = $this->inventory->move(
                    $issue->warehouse_id,
                    $item->product_id,
                    StockMovementType::EntregaSalida,
                    (float) $item->qty_base,
                    null,
                    $issue,
                    $user,
                    $issue->date?->setTimeFrom(now()),
                    "Vale {$issue->number} · {$issue->recipient?->name}",
                );
                $item->forceFill(['unit_cost' => (float) $movement->unit_cost])->save();
            }
            $issue->forceFill(['status' => S::Confirmado, 'confirmed_at' => now()])->save();

            return $issue;
        });
    }

    public function cancel(Issue $issue, User $user): Issue
    {
        $this->assertStatus($issue, [S::Borrador, S::Confirmado], 'anular');

        return DB::transaction(function () use ($issue, $user) {
            if ($issue->status === S::Confirmado) {
                $this->inventory->reverse($issue, $user, "Anulación de vale {$issue->number}");
            }
            $issue->forceFill(['status' => S::Anulado])->save();

            return $issue;
        });
    }

    private function assertStatus(Issue $issue, array $allowed, string $action): void
    {
        if (! in_array($issue->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} un vale en estado \"{$issue->status->label()}\".");
        }
    }
}
