<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['adjustment_id', 'product_id', 'qty_base', 'unit_cost', 'notes', 'sort_order'])]
class AdjustmentItem extends Model
{
    protected function casts(): array
    {
        return [
            'qty_base' => 'decimal:3',
            'unit_cost' => 'decimal:4',
        ];
    }

    public function adjustment(): BelongsTo
    {
        return $this->belongsTo(Adjustment::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
