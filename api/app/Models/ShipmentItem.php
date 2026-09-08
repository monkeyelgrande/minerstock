<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'shipment_id', 'product_id', 'purchase_request_item_id', 'unit_id', 'factor', 'quantity',
    'qty_base', 'unit_cost', 'qty_received_base', 'notes', 'sort_order',
])]
class ShipmentItem extends Model
{
    protected function casts(): array
    {
        return [
            'factor' => 'decimal:4',
            'quantity' => 'decimal:3',
            'qty_base' => 'decimal:3',
            'unit_cost' => 'decimal:4',
            'qty_received_base' => 'decimal:3',
        ];
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
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

    public function receiptItems(): HasMany
    {
        return $this->hasMany(ShipmentReceiptItem::class);
    }

    /** Cantidad (base) aún en camino. */
    public function pendingBase(): float
    {
        return max(0, (float) $this->qty_base - (float) $this->qty_received_base);
    }
}
