<?php

namespace App\Services\Inventory;

use App\Enums\PurchaseOrderStatus;
use App\Enums\SimpleDocStatus as S;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\User;
use App\Services\Purchasing\LineItems;
use Illuminate\Support\Facades\DB;

class GoodsReceiptService
{
    public function __construct(private readonly InventoryService $inventory) {}

    /** Crea o actualiza una recepción en borrador contra una OC emitida. */
    public function save(?GoodsReceipt $receipt, array $data, User $user): GoodsReceipt
    {
        if ($receipt && ! $receipt->status->isEditable()) {
            throw new DomainException('Solo se pueden editar recepciones en borrador.');
        }

        return DB::transaction(function () use ($receipt, $data, $user) {
            $order = PurchaseOrder::query()->with('items.product.units')->findOrFail($data['purchase_order_id']);
            if (! $order->status->canReceive()) {
                throw new DomainException("La orden {$order->number} no está emitida; no se puede recibir mercancía.");
            }
            if ($receipt && (int) $receipt->purchase_order_id !== (int) $order->id) {
                throw new DomainException('No se puede cambiar la orden de compra de una recepción.');
            }

            $attrs = [
                'purchase_order_id' => $order->id,
                'warehouse_id' => $data['warehouse_id'] ?? $order->warehouse_id,
                'supplier_remission' => $data['supplier_remission'] ?? null,
                'received_at' => $data['received_at'],
                'received_by' => $data['received_by'] ?? $user->id,
                'notes' => $data['notes'] ?? null,
            ];

            if ($receipt) {
                $receipt->fill($attrs)->save();
            } else {
                $receipt = GoodsReceipt::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $orderItems = $order->items->keyBy('id');
            // Recibido en otras recepciones borrador no cuenta; solo las confirmadas (qty_received_base).
            LineItems::sync($receipt->items(), $data['items'], function (array $line) use ($orderItems, $order) {
                /** @var PurchaseOrderItem $oi */
                $oi = $orderItems->get((int) $line['purchase_order_item_id'])
                    ?? throw new DomainException('El ítem no pertenece a la orden de compra.');
                $factor = LineItems::factorFor($oi->product, (int) ($line['unit_id'] ?? $oi->unit_id));
                $qty = (float) $line['quantity'];
                $qtyBase = round($qty * $factor, 3);

                if ($qtyBase > $oi->pendingToReceiveBase() + 0.0005) {
                    throw new DomainException(sprintf(
                        'La cantidad de %s supera lo pendiente en la orden %s (pendiente: %s %s).',
                        $oi->product->name, $order->number,
                        rtrim(rtrim(number_format($oi->pendingToReceiveBase(), 3, '.', ''), '0'), '.'),
                        $oi->product->baseUnit?->code ?? '',
                    ));
                }

                return [
                    'purchase_order_item_id' => $oi->id,
                    'product_id' => $oi->product_id,
                    'unit_id' => (int) ($line['unit_id'] ?? $oi->unit_id),
                    'factor' => $factor,
                    'quantity' => $qty,
                    'qty_base' => $qtyBase,
                    'unit_cost_base' => $oi->baseUnitCost(),
                    'notes' => $line['notes'] ?? null,
                ];
            });

            return $receipt->refresh();
        });
    }

    /** Confirma: entradas al kardex y acumulados de la OC. */
    public function confirm(GoodsReceipt $receipt, User $user): GoodsReceipt
    {
        $this->assertStatus($receipt, [S::Borrador], 'confirmar');
        if ($receipt->items()->count() === 0) {
            throw new DomainException('La recepción no tiene ítems.');
        }

        return DB::transaction(function () use ($receipt, $user) {
            $receipt->load('items.orderItem', 'order');
            if (! $receipt->order->status->canReceive()) {
                throw new DomainException("La orden {$receipt->order->number} ya no admite recepciones.");
            }

            foreach ($receipt->items as $item) {
                /** @var PurchaseOrderItem $oi */
                $oi = PurchaseOrderItem::query()->lockForUpdate()->findOrFail($item->purchase_order_item_id);
                if ((float) $item->qty_base > $oi->pendingToReceiveBase() + 0.0005) {
                    throw new DomainException("La cantidad recibida de {$item->product->name} supera lo pendiente en la orden.");
                }
                $this->inventory->move(
                    $receipt->warehouse_id,
                    $item->product_id,
                    StockMovementType::CompraEntrada,
                    (float) $item->qty_base,
                    (float) $item->unit_cost_base,
                    $receipt,
                    $user,
                    $receipt->received_at?->setTimeFrom(now()),
                    "Recepción {$receipt->number} · OC {$receipt->order->number}",
                );
                $oi->forceFill(['qty_received_base' => (float) $oi->qty_received_base + (float) $item->qty_base])->save();
            }

            $receipt->forceFill(['status' => S::Confirmado, 'confirmed_at' => now()])->save();
            $this->recalcOrderStatus($receipt->order);

            return $receipt;
        });
    }

    /** Anula una recepción confirmada: revierte kardex y acumulados (si no tiene devoluciones). */
    public function cancel(GoodsReceipt $receipt, User $user): GoodsReceipt
    {
        $this->assertStatus($receipt, [S::Borrador, S::Confirmado], 'anular');
        if ($receipt->returns()->where('status', '!=', S::Anulado->value)->exists()) {
            throw new DomainException('No se puede anular: la recepción tiene devoluciones a proveedor.');
        }

        return DB::transaction(function () use ($receipt, $user) {
            if ($receipt->status === S::Confirmado) {
                $this->inventory->reverse($receipt, $user, "Anulación de recepción {$receipt->number}");
                foreach ($receipt->items as $item) {
                    $oi = PurchaseOrderItem::query()->lockForUpdate()->findOrFail($item->purchase_order_item_id);
                    $oi->forceFill(['qty_received_base' => max(0, (float) $oi->qty_received_base - (float) $item->qty_base)])->save();
                }
            }
            $receipt->forceFill(['status' => S::Anulado])->save();
            $this->recalcOrderStatus($receipt->order()->first());

            return $receipt;
        });
    }

    /** emitida ↔ recibida_parcial ↔ recibida según acumulados. */
    public function recalcOrderStatus(PurchaseOrder $order): void
    {
        if (! in_array($order->status, [PurchaseOrderStatus::Emitida, PurchaseOrderStatus::RecibidaParcial, PurchaseOrderStatus::Recibida], true)) {
            return;
        }
        $items = $order->items()->get();
        $received = (float) $items->sum('qty_received_base');
        $total = (float) $items->sum('qty_base');

        $status = $received <= 0.0005
            ? PurchaseOrderStatus::Emitida
            : ($received + 0.0005 >= $total ? PurchaseOrderStatus::Recibida : PurchaseOrderStatus::RecibidaParcial);

        $order->forceFill(['status' => $status])->save();
    }

    private function assertStatus(GoodsReceipt $receipt, array $allowed, string $action): void
    {
        if (! in_array($receipt->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una recepción en estado \"{$receipt->status->label('f')}\".");
        }
    }
}
