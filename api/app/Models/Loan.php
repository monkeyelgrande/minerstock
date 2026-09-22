<?php

namespace App\Models;

use App\Enums\LoanStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/** Préstamo de herramientas retornables a un receptor (control por cantidad, sin serial). */
#[Fillable(['warehouse_id', 'recipient_id', 'loaned_at', 'expected_return_at', 'status', 'notes', 'confirmed_at', 'created_by'])]
class Loan extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'PR';

    protected function casts(): array
    {
        return [
            'status' => LoanStatus::class,
            'loaned_at' => 'date:Y-m-d',
            'expected_return_at' => 'date:Y-m-d',
            'confirmed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(LoanItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function returns(): HasMany
    {
        return $this->hasMany(LoanReturn::class)->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(Recipient::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'source');
    }

    /** Vencido: abierto o parcial con fecha esperada de devolución en el pasado. */
    public function isOverdue(): bool
    {
        return $this->status->isOpen()
            && $this->expected_return_at !== null
            && $this->expected_return_at->isBefore(today());
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->whereIn('status', [LoanStatus::Abierto, LoanStatus::Parcial])
            ->whereNotNull('expected_return_at')
            ->whereDate('expected_return_at', '<', today());
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->pluck('warehouses.id'));
    }
}
