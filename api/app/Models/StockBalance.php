<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['warehouse_id', 'product_id', 'qty', 'avg_cost', 'last_movement_at'])]
class StockBalance extends Model
{
    protected function casts(): array
    {
        return [
            'qty' => 'decimal:3',
            'avg_cost' => 'decimal:4',
            'last_movement_at' => 'datetime',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function totalValue(): float
    {
        return round((float) $this->qty * (float) $this->avg_cost, 2);
    }
}
