<?php

namespace App\Models;

use App\Enums\QuotationStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['supplier_id', 'date', 'valid_until', 'status', 'subtotal', 'tax', 'total', 'notes', 'created_by'])]
class Quotation extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'CO';

    protected function casts(): array
    {
        return [
            'status' => QuotationStatus::class,
            'date' => 'date:Y-m-d',
            'valid_until' => 'date:Y-m-d',
            'subtotal' => 'decimal:2',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(QuotationItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
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
