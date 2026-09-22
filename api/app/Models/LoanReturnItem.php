<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['loan_return_id', 'loan_item_id', 'qty_base', 'condition', 'notes'])]
class LoanReturnItem extends Model
{
    public const CONDITIONS = [
        'bueno' => 'Bueno',
        'dañado' => 'Dañado',
        'perdido' => 'Perdido',
    ];

    protected function casts(): array
    {
        return ['qty_base' => 'decimal:3'];
    }

    public function loanReturn(): BelongsTo
    {
        return $this->belongsTo(LoanReturn::class);
    }

    public function loanItem(): BelongsTo
    {
        return $this->belongsTo(LoanItem::class);
    }
}
