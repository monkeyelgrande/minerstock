<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'description' => $this->description,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => $this->category ? [
                'id' => $this->category->id,
                'name' => $this->category->name,
            ] : null),
            'base_unit_id' => $this->base_unit_id,
            'base_unit' => $this->whenLoaded('baseUnit', fn () => [
                'id' => $this->baseUnit->id,
                'code' => $this->baseUnit->code,
                'name' => $this->baseUnit->name,
                'allows_decimals' => $this->baseUnit->allows_decimals,
            ]),
            'kind' => $this->kind,
            'default_min_stock' => (float) $this->default_min_stock,
            'barcode' => $this->barcode,
            'image_path' => $this->image_path,
            'is_active' => $this->is_active,
            'units' => $this->whenLoaded('units', fn () => $this->units->map(fn ($u) => [
                'id' => $u->id,
                'unit_id' => $u->unit_id,
                'unit' => $u->relationLoaded('unit') ? [
                    'id' => $u->unit->id,
                    'code' => $u->unit->code,
                    'name' => $u->unit->name,
                ] : null,
                'factor' => (float) $u->factor,
                'is_default_purchase' => $u->is_default_purchase,
            ])),
            'warehouse_settings' => $this->whenLoaded('warehouseSettings', fn () => $this->warehouseSettings->map(fn ($s) => [
                'id' => $s->id,
                'warehouse_id' => $s->warehouse_id,
                'warehouse' => $s->relationLoaded('warehouse') ? [
                    'id' => $s->warehouse->id,
                    'code' => $s->warehouse->code,
                    'name' => $s->warehouse->name,
                ] : null,
                'min_stock' => (float) $s->min_stock,
                'max_stock' => $s->max_stock !== null ? (float) $s->max_stock : null,
            ])),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
