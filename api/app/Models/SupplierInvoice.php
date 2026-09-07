<?php

namespace App\Models;

use App\Enums\InvoiceStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'supplier_invoice_number', 'supplier_id', 'purchase_order_id', 'issue_date', 'due_date',
    'subtotal', 'tax', 'withholding', 'total', 'paid_amount', 'credited_amount', 'status', 'notes', 'created_by',
])]
class SupplierInvoice extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'FP';

    protected function casts(): array
    {
        return [
            'status' => InvoiceStatus::class,
            'issue_date' => 'date:Y-m-d',
            'due_date' => 'date:Y-m-d',
            'subtotal' => 'decimal:2',
            'tax' => 'decimal:2',
            'withholding' => 'decimal:2',
            'total' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'credited_amount' => 'decimal:2',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function receipts(): BelongsToMany
    {
        return $this->belongsToMany(GoodsReceipt::class, 'supplier_invoice_receipts')->withTimestamps();
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPaymentAllocation::class);
    }

    public function creditApplications(): HasMany
    {
        return $this->hasMany(SupplierCreditNoteApplication::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function balance(): float
    {
        return round((float) $this->total - (float) $this->paid_amount - (float) $this->credited_amount, 2);
    }

    public function isOverdue(): bool
    {
        return $this->status->isOpen() && $this->due_date !== null && $this->due_date->isPast() && ! $this->due_date->isToday();
    }

    /** Sin pagos ni notas aplicadas: se puede editar o anular. */
    public function isUntouched(): bool
    {
        return (float) $this->paid_amount === 0.0 && (float) $this->credited_amount === 0.0;
    }

    /** Recalcula estado según saldo. No toca facturas anuladas. */
    public function recalcStatus(): void
    {
        if ($this->status === InvoiceStatus::Anulada) {
            return;
        }
        $balance = $this->balance();
        $status = $balance <= 0.009
            ? InvoiceStatus::Pagada
            : ($this->isUntouched() ? InvoiceStatus::Pendiente : InvoiceStatus::Parcial);
        $this->forceFill(['status' => $status])->save();
    }
}
