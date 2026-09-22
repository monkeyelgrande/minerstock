<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['loan_id', 'product_id', 'qty_base', 'unit_cost', 'qty_returned_base', 'qty_damaged_base', 'qty_lost_base', 'notes', 'sort_order'])]
class LoanItem extends Model
{
    protected function casts(): array
    {
        return [
            'qty_base' => 'decimal:3',
            'unit_cost' => 'decimal:4',
            'qty_returned_base' => 'decimal:3',
            'qty_damaged_base' => 'decimal:3',
            'qty_lost_base' => 'decimal:3',
        ];
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function returnItems(): HasMany
    {
        return $this->hasMany(LoanReturnItem::class);
    }

    /** Lo que sigue en poder del receptor. */
    public function outstandingBase(): float
    {
        return round(
            (float) $this->qty_base - (float) $this->qty_returned_base
                - (float) $this->qty_damaged_base - (float) $this->qty_lost_base,
            3,
        );
    }
}
