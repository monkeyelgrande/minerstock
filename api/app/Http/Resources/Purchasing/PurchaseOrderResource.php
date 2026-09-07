<?php

namespace App\Http\Resources\Purchasing;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PurchaseOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
                'document_number' => $this->supplier->document_number,
                'contact_name' => $this->supplier->contact_name,
                'phone' => $this->supplier->phone,
                'email' => $this->supplier->email,
            ]),
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'date' => $this->date?->format('Y-m-d'),
            'expected_date' => $this->expected_date?->format('Y-m-d'),
            'payment_terms' => $this->payment_terms,
            'payment_days' => $this->payment_days,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable(),
            'subtotal' => (float) $this->subtotal,
            'tax' => (float) $this->tax,
            'total' => (float) $this->total,
            'notes' => $this->notes,
            'submitted_at' => $this->submitted_at,
            'approved_at' => $this->approved_at,
            'issued_at' => $this->issued_at,
            'approver' => $this->whenLoaded('approver', fn () => $this->approver ? ['id' => $this->approver->id, 'name' => $this->approver->name] : null),
            'rejection_reason' => $this->rejection_reason,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'received_pct' => $this->whenLoaded('items', fn () => $this->receivedPct()),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id,
                    'sku' => $i->product->sku,
                    'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'purchase_request_item_id' => $i->purchase_request_item_id,
                'request' => $i->relationLoaded('requestItem') && $i->requestItem ? [
                    'id' => $i->requestItem->purchase_request_id,
                    'number' => $i->requestItem->relationLoaded('request') ? $i->requestItem->request->number : null,
                ] : null,
                'quotation_item_id' => $i->quotation_item_id,
                'unit_id' => $i->unit_id,
                'unit' => $i->relationLoaded('unit') ? ['id' => $i->unit->id, 'code' => $i->unit->code, 'name' => $i->unit->name] : null,
                'factor' => (float) $i->factor,
                'quantity' => (float) $i->quantity,
                'qty_base' => (float) $i->qty_base,
                'unit_price' => (float) $i->unit_price,
                'base_unit_cost' => $i->baseUnitCost(),
                'tax_rate' => (float) $i->tax_rate,
                'line_total' => (float) $i->line_total,
                'qty_received_base' => (float) $i->qty_received_base,
                'qty_returned_base' => (float) $i->qty_returned_base,
                'pending_base' => $i->pendingToReceiveBase(),
                'notes' => $i->notes,
            ])),
            'receipts' => $this->whenLoaded('receipts', fn () => $this->receipts->map(fn ($r) => [
                'id' => $r->id, 'number' => $r->number, 'received_at' => $r->received_at?->format('Y-m-d'),
                'supplier_remission' => $r->supplier_remission, 'status' => $r->status->value, 'status_label' => $r->status->label('f'),
                'items_count' => $r->items_count ?? null,
            ])),
            'can_receive' => $this->status->canReceive(),
            'approvals' => ApprovalResource::collection($this->whenLoaded('approvals')),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function receivedPct(): int
    {
        $total = (float) $this->items->sum('qty_base');
        if ($total <= 0) {
            return 0;
        }

        return (int) round(min(100, (float) $this->items->sum('qty_received_base') / $total * 100));
    }
}
