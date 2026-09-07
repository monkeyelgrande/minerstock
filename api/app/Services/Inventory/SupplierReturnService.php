<?php

namespace App\Services\Inventory;

use App\Enums\SimpleDocStatus as S;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\PurchaseOrderItem;
use App\Models\SupplierCreditNote;
use App\Models\SupplierReturn;
use App\Models\User;
use App\Services\Payables\CreditNoteService;
use App\Services\Purchasing\LineItems;
use Illuminate\Support\Facades\DB;

class SupplierReturnService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly CreditNoteService $creditNotes,
    ) {}

    public function save(?SupplierReturn $return, array $data, User $user): SupplierReturn
    {
        if ($return && ! $return->status->isEditable()) {
            throw new DomainException('Solo se pueden editar devoluciones en borrador.');
        }

        return DB::transaction(function () use ($return, $data, $user) {
            $receipt = GoodsReceipt::query()->with(['items.product', 'order'])->findOrFail($data['goods_receipt_id']);
            if ($receipt->status !== S::Confirmado) {
                throw new DomainException("La recepción {$receipt->number} no está confirmada.");
            }

            $attrs = [
                'supplier_id' => $receipt->order->supplier_id,
                'goods_receipt_id' => $receipt->id,
                'warehouse_id' => $receipt->warehouse_id,
                'date' => $data['date'],
                'reason' => $data['reason'] ?? 'defectuoso',
                'notes' => $data['notes'] ?? null,
            ];

            if ($return) {
                if ((int) $return->goods_receipt_id !== (int) $receipt->id) {
                    throw new DomainException('No se puede cambiar la recepción de una devolución.');
                }
                $return->fill($attrs)->save();
            } else {
                $return = SupplierReturn::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $receiptItems = $receipt->items->keyBy('id');
            LineItems::sync($return->items(), $data['items'], function (array $line) use ($receiptItems) {
                /** @var GoodsReceiptItem $ri */
                $ri = $receiptItems->get((int) $line['goods_receipt_item_id'])
                    ?? throw new DomainException('El ítem no pertenece a la recepción.');
                $qty = (float) $line['qty_base'];
                if ($qty > $ri->returnableBase() + 0.0005) {
                    throw new DomainException("La cantidad a devolver de {$ri->product->name} supera lo recibido disponible.");
                }

                return [
                    'goods_receipt_item_id' => $ri->id,
                    'product_id' => $ri->product_id,
                    'qty_base' => $qty,
                    'unit_cost_base' => (float) $ri->unit_cost_base,
                    'notes' => $line['notes'] ?? null,
                ];
            });

            $return->forceFill(['total_cost' => round((float) $return->items()->get()->sum(fn ($i) => (float) $i->qty_base * (float) $i->unit_cost_base), 2)])->save();

            return $return->refresh();
        });
    }

    /** Confirma: salidas del kardex al costo de la recepción y acumulados de devolución. */
    public function confirm(SupplierReturn $return, User $user): SupplierReturn
    {
        $this->assertStatus($return, [S::Borrador], 'confirmar');
        if ($return->items()->count() === 0) {
            throw new DomainException('La devolución no tiene ítems.');
        }

        return DB::transaction(function () use ($return, $user) {
            $return->load('items.receiptItem');
            foreach ($return->items as $item) {
                /** @var GoodsReceiptItem $ri */
                $ri = GoodsReceiptItem::query()->lockForUpdate()->findOrFail($item->goods_receipt_item_id);
                if ((float) $item->qty_base > $ri->returnableBase() + 0.0005) {
                    throw new DomainException('La cantidad a devolver supera lo recibido disponible.');
                }
                $this->inventory->move(
                    $return->warehouse_id,
                    $item->product_id,
                    StockMovementType::DevolucionProveedorSalida,
                    (float) $item->qty_base,
                    (float) $item->unit_cost_base,
                    $return,
                    $user,
                    $return->date?->setTimeFrom(now()),
                    "Devolución {$return->number}",
                );
                $ri->forceFill(['qty_returned_base' => (float) $ri->qty_returned_base + (float) $item->qty_base])->save();
                PurchaseOrderItem::query()->where('id', $ri->purchase_order_item_id)
                    ->increment('qty_returned_base', (float) $item->qty_base);
            }
            $return->forceFill(['status' => S::Confirmado, 'confirmed_at' => now()])->save();

            // La devolución confirmada genera automáticamente su nota crédito.
            $this->creditNotes->createFromReturn($return, $user);

            return $return;
        });
    }

    public function cancel(SupplierReturn $return, User $user): SupplierReturn
    {
        $this->assertStatus($return, [S::Borrador, S::Confirmado], 'anular');

        $note = SupplierCreditNote::query()
            ->where('supplier_return_id', $return->id)
            ->where('status', '!=', 'anulada')
            ->first();
        if ($note && (float) $note->applied_amount > 0) {
            throw new DomainException("No se puede anular: la nota crédito {$note->number} ya fue aplicada a facturas.");
        }

        return DB::transaction(function () use ($return, $user, $note) {
            if ($return->status === S::Confirmado) {
                $this->inventory->reverse($return, $user, "Anulación de devolución {$return->number}");
                foreach ($return->items as $item) {
                    $ri = GoodsReceiptItem::query()->lockForUpdate()->findOrFail($item->goods_receipt_item_id);
                    $ri->forceFill(['qty_returned_base' => max(0, (float) $ri->qty_returned_base - (float) $item->qty_base)])->save();
                    PurchaseOrderItem::query()->where('id', $ri->purchase_order_item_id)
                        ->decrement('qty_returned_base', (float) $item->qty_base);
                }
            }
            $note?->forceFill(['status' => 'anulada'])->save();
            $return->forceFill(['status' => S::Anulado])->save();

            return $return;
        });
    }

    private function assertStatus(SupplierReturn $return, array $allowed, string $action): void
    {
        if (! in_array($return->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una devolución en estado \"{$return->status->label('f')}\".");
        }
    }
}
