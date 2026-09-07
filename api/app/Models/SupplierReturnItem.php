<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['supplier_return_id', 'goods_receipt_item_id', 'product_id', 'qty_base', 'unit_cost_base', 'notes', 'sort_order'])]
class SupplierReturnItem extends Model
{
    protected function casts(): array
    {
        return [
            'qty_base' => 'decimal:3',
            'unit_cost_base' => 'decimal:4',
        ];
    }

    public function return(): BelongsTo
    {
        return $this->belongsTo(SupplierReturn::class, 'supplier_return_id');
    }

    public function receiptItem(): BelongsTo
    {
        return $this->belongsTo(GoodsReceiptItem::class, 'goods_receipt_item_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
