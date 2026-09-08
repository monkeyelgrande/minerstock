<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'quotation_id', 'product_id', 'purchase_request_item_id', 'unit_id', 'factor', 'quantity', 'qty_base',
    'unit_price', 'tax_rate', 'line_total', 'delivery_days', 'notes', 'is_selected', 'not_quoted', 'purchase_order_item_id', 'sort_order',
])]
class QuotationItem extends Model
{
    protected function casts(): array
    {
        return [
            'factor' => 'decimal:4',
            'quantity' => 'decimal:3',
            'qty_base' => 'decimal:3',
            'unit_price' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'line_total' => 'decimal:2',
            'delivery_days' => 'integer',
            'is_selected' => 'boolean',
            'not_quoted' => 'boolean',
        ];
    }

    public function quotation(): BelongsTo
    {
        return $this->belongsTo(Quotation::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function requestItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestItem::class, 'purchase_request_item_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class, 'purchase_order_item_id');
    }

    /** Precio por unidad base (para comparar cotizaciones en distintas unidades). */
    public function basePrice(): ?float
    {
        if ($this->unit_price === null || $this->not_quoted) {
            return null;
        }
        $factor = (float) $this->factor ?: 1.0;

        return round((float) $this->unit_price / $factor, 4);
    }
}
