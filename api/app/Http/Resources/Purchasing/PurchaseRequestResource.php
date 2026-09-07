<?php

namespace App\Http\Resources\Purchasing;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PurchaseRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'warehouse_id' => $this->warehouse_id,
            'warehouse' => $this->whenLoaded('warehouse', fn () => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name]),
            'requested_by' => $this->requested_by,
            'requester' => $this->whenLoaded('requester', fn () => ['id' => $this->requester->id, 'name' => $this->requester->name]),
            'required_date' => $this->required_date?->format('Y-m-d'),
            'priority' => $this->priority,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable(),
            'notes' => $this->notes,
            'submitted_at' => $this->submitted_at,
            'approved_at' => $this->approved_at,
            'approver' => $this->whenLoaded('approver', fn () => $this->approver ? ['id' => $this->approver->id, 'name' => $this->approver->name] : null),
            'rejection_reason' => $this->rejection_reason,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id,
                    'sku' => $i->product->sku,
                    'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'unit_id' => $i->unit_id,
                'unit' => $i->relationLoaded('unit') ? ['id' => $i->unit->id, 'code' => $i->unit->code, 'name' => $i->unit->name] : null,
                'factor' => (float) $i->factor,
                'quantity' => (float) $i->quantity,
                'qty_base' => (float) $i->qty_base,
                'qty_ordered_base' => (float) $i->qty_ordered_base,
                'qty_shipped_base' => (float) $i->qty_shipped_base,
                'pending_base' => $i->pendingToOrderBase(),
                'notes' => $i->notes,
            ])),
            'progress' => $this->whenLoaded('items', fn () => $this->progress()),
            'approvals' => ApprovalResource::collection($this->whenLoaded('approvals')),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    /** Avance: % ordenado y % despachado sobre lo solicitado (en unidad base). */
    private function progress(): array
    {
        $total = (float) $this->items->sum('qty_base');
        if ($total <= 0) {
            return ['ordered' => 0, 'shipped' => 0];
        }

        return [
            'ordered' => round(min(100, (float) $this->items->sum('qty_ordered_base') / $total * 100)),
            'shipped' => round(min(100, (float) $this->items->sum('qty_shipped_base') / $total * 100)),
        ];
    }
}
