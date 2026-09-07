<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'purchase_order_id', 'product_id', 'purchase_request_item_id', 'quotation_item_id', 'unit_id', 'factor',
    'quantity', 'qty_base', 'unit_price', 'tax_rate', 'line_total', 'qty_received_base', 'qty_returned_base',
    'notes', 'sort_order',
])]
class PurchaseOrderItem extends Model
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
            'qty_received_base' => 'decimal:3',
            'qty_returned_base' => 'decimal:3',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
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

    public function quotationItem(): BelongsTo
    {
        return $this->belongsTo(QuotationItem::class);
    }

    /** Costo por unidad base (para el kardex al recibir). */
    public function baseUnitCost(): float
    {
        $factor = (float) $this->factor ?: 1.0;

        return round((float) $this->unit_price / $factor, 4);
    }

    public function pendingToReceiveBase(): float
    {
        return max(0, (float) $this->qty_base - (float) $this->qty_received_base);
    }
}
