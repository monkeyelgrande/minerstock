<?php

namespace App\Models;

use App\Enums\CreditNoteStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'supplier_id', 'supplier_return_id', 'supplier_note_number', 'date', 'amount',
    'applied_amount', 'status', 'notes', 'created_by',
])]
class SupplierCreditNote extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'NC';

    protected function casts(): array
    {
        return [
            'status' => CreditNoteStatus::class,
            'date' => 'date:Y-m-d',
            'amount' => 'decimal:2',
            'applied_amount' => 'decimal:2',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function supplierReturn(): BelongsTo
    {
        return $this->belongsTo(SupplierReturn::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(SupplierCreditNoteApplication::class)->orderByDesc('id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function availableAmount(): float
    {
        return round((float) $this->amount - (float) $this->applied_amount, 2);
    }

    public function recalcStatus(): void
    {
        if ($this->status === CreditNoteStatus::Anulada) {
            return;
        }
        $this->forceFill([
            'status' => $this->availableAmount() <= 0.009 ? CreditNoteStatus::Aplicada : CreditNoteStatus::Disponible,
        ])->save();
    }
}
