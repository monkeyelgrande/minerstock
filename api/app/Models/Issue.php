<?php

namespace App\Models;

use App\Enums\SimpleDocStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/** Vale de salida: entrega de consumibles a un receptor con centro de costo. */
#[Fillable(['warehouse_id', 'recipient_id', 'cost_center_id', 'date', 'status', 'notes', 'confirmed_at', 'created_by'])]
class Issue extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'VS';

    protected function casts(): array
    {
        return [
            'status' => SimpleDocStatus::class,
            'date' => 'date:Y-m-d',
            'confirmed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(IssueItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(Recipient::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'source');
    }

    public function total(): float
    {
        return round($this->items->sum(fn ($i) => (float) $i->qty_base * (float) $i->unit_cost), 2);
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->pluck('warehouses.id'));
    }
}
