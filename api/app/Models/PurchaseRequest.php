<?php

namespace App\Models;

use App\Enums\PurchaseRequestStatus;
use App\Models\Concerns\HasApprovals;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'warehouse_id', 'requested_by', 'required_date', 'priority', 'status', 'notes',
    'approved_by', 'submitted_at', 'approved_at', 'rejection_reason', 'created_by',
])]
class PurchaseRequest extends Model
{
    use HasApprovals, HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'SC';

    protected function casts(): array
    {
        return [
            'status' => PurchaseRequestStatus::class,
            'required_date' => 'date:Y-m-d',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseRequestItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Limita a las bodegas visibles por el usuario. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->pluck('warehouses.id'));
    }
}
