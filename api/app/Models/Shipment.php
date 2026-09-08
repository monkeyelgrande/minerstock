<?php

namespace App\Models;

use App\Enums\ShipmentStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

#[Fillable([
    'origin_warehouse_id', 'destination_warehouse_id', 'vehicle_id', 'driver_id', 'status',
    'dispatched_at', 'dispatched_by', 'notes', 'created_by',
])]
class Shipment extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'PL';

    protected function casts(): array
    {
        return [
            'status' => ShipmentStatus::class,
            'dispatched_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(ShipmentItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function origin(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'origin_warehouse_id');
    }

    public function destination(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'destination_warehouse_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function dispatcher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(ShipmentReceipt::class)->orderByDesc('id');
    }

    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'source');
    }

    /** Visible si el usuario opera la bodega origen o la destino. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }
        $ids = $user->warehouses()->pluck('warehouses.id');

        return $query->where(fn ($q) => $q->whereIn('origin_warehouse_id', $ids)->orWhereIn('destination_warehouse_id', $ids));
    }

    public function totalCost(): float
    {
        return round((float) $this->items->sum(fn ($i) => (float) $i->qty_base * (float) $i->unit_cost), 2);
    }
}
