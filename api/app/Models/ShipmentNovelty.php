<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'shipment_receipt_item_id', 'type', 'qty_base', 'description',
    'status', 'resolution', 'resolved_by', 'resolved_at',
])]
class ShipmentNovelty extends Model
{
    public const TYPES = [
        'faltante' => 'Faltante',
        'dañado' => 'Dañado',
        'sobrante' => 'Sobrante',
    ];

    protected function casts(): array
    {
        return [
            'qty_base' => 'decimal:3',
            'resolved_at' => 'datetime',
        ];
    }

    public function receiptItem(): BelongsTo
    {
        return $this->belongsTo(ShipmentReceiptItem::class, 'shipment_receipt_item_id');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
