<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/** Devolución (total o parcial) de un préstamo; se registra ya confirmada. */
#[Fillable(['loan_id', 'returned_at', 'received_by', 'notes'])]
class LoanReturn extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return ['returned_at' => 'date:Y-m-d'];
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(LoanReturnItem::class)->orderBy('id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'source');
    }
}
