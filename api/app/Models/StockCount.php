<?php

namespace App\Models;

use App\Enums\StockCountStatus;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['warehouse_id', 'date', 'status', 'counted_by', 'notes', 'adjustment_id', 'closed_at', 'created_by'])]
class StockCount extends Model
{
    use HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'CF';

    protected function casts(): array
    {
        return [
            'status' => StockCountStatus::class,
            'date' => 'date:Y-m-d',
            'closed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockCountItem::class)->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function counter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function adjustment(): BelongsTo
    {
        return $this->belongsTo(Adjustment::class);
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->pluck('warehouses.id'));
    }
}
