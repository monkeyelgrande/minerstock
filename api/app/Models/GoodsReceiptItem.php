<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'goods_receipt_id', 'purchase_order_item_id', 'product_id', 'unit_id', 'factor', 'quantity', 'qty_base',
    'unit_cost_base', 'qty_returned_base', 'notes', 'sort_order',
])]
class GoodsReceiptItem extends Model
{
    protected function casts(): array
    {
        return [
            'factor' => 'decimal:4',
            'quantity' => 'decimal:3',
            'qty_base' => 'decimal:3',
            'unit_cost_base' => 'decimal:4',
            'qty_returned_base' => 'decimal:3',
        ];
    }

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(GoodsReceipt::class, 'goods_receipt_id');
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class, 'purchase_order_item_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    /** Cantidad (base) que aún puede devolverse al proveedor. */
    public function returnableBase(): float
    {
        return max(0, (float) $this->qty_base - (float) $this->qty_returned_base);
    }
}
