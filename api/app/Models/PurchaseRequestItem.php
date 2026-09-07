<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'purchase_request_id', 'product_id', 'unit_id', 'factor', 'quantity', 'qty_base',
    'qty_ordered_base', 'qty_shipped_base', 'notes', 'sort_order',
])]
class PurchaseRequestItem extends Model
{
    protected function casts(): array
    {
        return [
            'factor' => 'decimal:4',
            'quantity' => 'decimal:3',
            'qty_base' => 'decimal:3',
            'qty_ordered_base' => 'decimal:3',
            'qty_shipped_base' => 'decimal:3',
        ];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class, 'purchase_request_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function quotationItems(): HasMany
    {
        return $this->hasMany(QuotationItem::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    /** Cantidad (en unidad base) que aún no tiene orden de compra. */
    public function pendingToOrderBase(): float
    {
        return max(0, (float) $this->qty_base - (float) $this->qty_ordered_base);
    }
}
