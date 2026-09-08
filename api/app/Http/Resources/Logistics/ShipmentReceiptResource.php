<?php

namespace App\Http\Resources\Logistics;

use App\Http\Resources\Purchasing\AttachmentResource;
use App\Models\ShipmentNovelty;
use App\Models\ShipmentReceipt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShipmentReceiptResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'shipment_id' => $this->shipment_id,
            'shipment' => $this->whenLoaded('shipment', fn () => [
                'id' => $this->shipment->id,
                'number' => $this->shipment->number,
                'status' => $this->shipment->status->value,
                'status_label' => $this->shipment->status->label(),
                'origin' => $this->shipment->relationLoaded('origin') ? ['id' => $this->shipment->origin->id, 'code' => $this->shipment->origin->code, 'name' => $this->shipment->origin->name] : null,
                'destination' => $this->shipment->relationLoaded('destination') ? ['id' => $this->shipment->destination->id, 'code' => $this->shipment->destination->code, 'name' => $this->shipment->destination->name] : null,
                'vehicle' => $this->shipment->relationLoaded('vehicle') && $this->shipment->vehicle ? ['plate' => $this->shipment->vehicle->plate] : null,
                'driver' => $this->shipment->relationLoaded('driver') && $this->shipment->driver ? ['name' => $this->shipment->driver->name] : null,
                'dispatched_at' => $this->shipment->dispatched_at,
            ]),
            'received_at' => $this->received_at?->format('Y-m-d'),
            'receiver' => $this->whenLoaded('receiver', fn () => ['id' => $this->receiver->id, 'name' => $this->receiver->name]),
            'status' => $this->status->value,
            'status_label' => $this->status->label('f'),
            'is_editable' => $this->status->isEditable(),
            'has_signed_sheet' => $this->hasSignedSheet(),
            'signed_sheet_purpose' => ShipmentReceipt::SIGNED_SHEET_PURPOSE,
            'notes' => $this->notes,
            'confirmed_at' => $this->confirmed_at,
            'items_count' => $this->whenNotNull($this->items_count ?? null),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'shipment_item_id' => $i->shipment_item_id,
                'product_id' => $i->product_id,
                'product' => $i->relationLoaded('product') ? [
                    'id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name,
                    'base_unit' => $i->product->relationLoaded('baseUnit') ? $i->product->baseUnit->code : null,
                ] : null,
                'shipment_item' => $i->relationLoaded('shipmentItem') && $i->shipmentItem ? [
                    'qty_base' => (float) $i->shipmentItem->qty_base,
                    'pending_base' => $i->shipmentItem->pendingBase(),
                    'unit_cost' => (float) $i->shipmentItem->unit_cost,
                ] : null,
                'qty_received_base' => (float) $i->qty_received_base,
                'qty_missing_base' => (float) $i->qty_missing_base,
                'qty_damaged_base' => (float) $i->qty_damaged_base,
                'qty_extra_base' => (float) $i->qty_extra_base,
                'has_novelty' => (float) $i->qty_missing_base > 0 || (float) $i->qty_damaged_base > 0 || (float) $i->qty_extra_base > 0,
                'notes' => $i->notes,
            ])),
            'novelties' => $this->whenLoaded('novelties', fn () => $this->novelties->map(fn ($n) => [
                'id' => $n->id,
                'type' => $n->type,
                'type_label' => ShipmentNovelty::TYPES[$n->type] ?? $n->type,
                'qty_base' => (float) $n->qty_base,
                'status' => $n->status,
                'description' => $n->description,
            ])),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
