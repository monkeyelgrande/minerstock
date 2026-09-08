<?php

namespace App\Http\Resources\Logistics;

use App\Http\Resources\Purchasing\AttachmentResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShipmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'origin_warehouse_id' => $this->origin_warehouse_id,
            'origin' => $this->whenLoaded('origin', fn () => ['id' => $this->origin->id, 'code' => $this->origin->code, 'name' => $this->origin->name]),
            'destination_warehouse_id' => $this->destination_warehouse_id,
            'destination' => $this->whenLoaded('destination', fn () => ['id' => $this->destination->id, 'code' => $this->destination->code, 'name' => $this->destination->name]),
            'vehicle_id' => $this->vehicle_id,
            'vehicle' => $this->whenLoaded('vehicle', fn () => $this->vehicle ? ['id' => $this->vehicle->id, 'plate' => $this->vehicle->plate, 'type' => $this->vehicle->type, 'brand' => $this->vehicle->brand] : null),
            'driver_id' => $this->driver_id,
            'driver' => $this->whenLoaded('driver', fn () => $this->driver ? ['id' => $this->driver->id, 'name' => $this->driver->name, 'document_number' => $this->driver->document_number, 'phone' => $this->driver->phone] : null),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_editable' => $this->status->isEditable(),
            'can_receive' => $this->status->canReceive(),
            'dispatched_at' => $this->dispatched_at,
            'dispatcher' => $this->whenLoaded('dispatcher', fn () => $this->dispatcher ? ['id' => $this->dispatcher->id, 'name' => $this->dispatcher->name] : null),
            'notes' => $this->notes,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'total_cost' => $this->whenLoaded('items', fn () => $this->totalCost()),
            'received_pct' => $this->whenLoaded('items', fn () => $this->receivedPct()),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'purchase_request_item_id' => $i->purchase_request_item_id,
                'request' => $i->relationLoaded('requestItem') && $i->requestItem ? [
                    'id' => $i->requestItem->purchase_request_id,
                    'number' => $i->requestItem->relationLoaded('request') ? $i->requestItem->request->number : null,
                ] : null,
                'unit_id' => $i->unit_id,
                'unit' => $i->relationLoaded('unit') ? ['id' => $i->unit->id, 'code' => $i->unit->code, 'name' => $i->unit->name] : null,
                'factor' => (float) $i->factor,
                'quantity' => (float) $i->quantity,
                'qty_base' => (float) $i->qty_base,
                'unit_cost' => (float) $i->unit_cost,
                'line_cost' => round((float) $i->qty_base * (float) $i->unit_cost, 2),
                'qty_received_base' => (float) $i->qty_received_base,
                'pending_base' => $i->pendingBase(),
                'notes' => $i->notes,
            ])),
            'receipts' => $this->whenLoaded('receipts', fn () => $this->receipts->map(fn ($r) => [
                'id' => $r->id,
                'number' => $r->number,
                'received_at' => $r->received_at?->format('Y-m-d'),
                'status' => $r->status->value,
                'status_label' => $r->status->label('f'),
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    private function receivedPct(): int
    {
        $total = (float) $this->items->sum('qty_base');

        return $total > 0 ? (int) round(min(100, (float) $this->items->sum('qty_received_base') / $total * 100)) : 0;
    }
}
