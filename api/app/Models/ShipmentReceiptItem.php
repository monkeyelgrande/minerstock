<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'shipment_receipt_id', 'shipment_item_id', 'product_id',
    'qty_received_base', 'qty_missing_base', 'qty_damaged_base', 'qty_extra_base', 'notes',
])]
class ShipmentReceiptItem extends Model
{
    protected function casts(): array
    {
        return [
            'qty_received_base' => 'decimal:3',
            'qty_missing_base' => 'decimal:3',
            'qty_damaged_base' => 'decimal:3',
            'qty_extra_base' => 'decimal:3',
        ];
    }

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(ShipmentReceipt::class, 'shipment_receipt_id');
    }

    public function shipmentItem(): BelongsTo
    {
        return $this->belongsTo(ShipmentItem::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function novelties(): HasMany
    {
        return $this->hasMany(ShipmentNovelty::class);
    }
}
