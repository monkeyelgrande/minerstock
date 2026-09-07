<?php

namespace App\Models;

use App\Enums\PurchaseOrderStatus;
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
    'supplier_id', 'warehouse_id', 'date', 'expected_date', 'payment_terms', 'payment_days', 'status',
    'subtotal', 'tax', 'total', 'notes', 'approved_by', 'submitted_at', 'approved_at', 'issued_at',
    'rejection_reason', 'created_by',
])]
class PurchaseOrder extends Model
{
    use HasApprovals, HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'OC';

    protected function casts(): array
    {
        return [
            'status' => PurchaseOrderStatus::class,
            'date' => 'date:Y-m-d',
            'expected_date' => 'date:Y-m-d',
            'payment_days' => 'integer',
            'subtotal' => 'decimal:2',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'issued_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->pluck('warehouses.id'));
    }

    public function recalcTotals(): void
    {
        $subtotal = 0.0;
        $tax = 0.0;
        foreach ($this->items as $item) {
            $line = (float) $item->quantity * (float) $item->unit_price;
            $subtotal += $line;
            $tax += $line * (float) $item->tax_rate / 100;
        }
        $this->forceFill([
            'subtotal' => round($subtotal, 2),
            'tax' => round($tax, 2),
            'total' => round($subtotal + $tax, 2),
        ])->save();
    }
}
