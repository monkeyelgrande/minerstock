<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['stock_count_id', 'product_id', 'system_qty', 'counted_qty', 'notes'])]
class StockCountItem extends Model
{
    protected function casts(): array
    {
        return [
            'system_qty' => 'decimal:3',
            'counted_qty' => 'decimal:3',
        ];
    }

    public function count(): BelongsTo
    {
        return $this->belongsTo(StockCount::class, 'stock_count_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function difference(): ?float
    {
        if ($this->counted_qty === null) {
            return null;
        }

        return round((float) $this->counted_qty - (float) $this->system_qty, 3);
    }
}
