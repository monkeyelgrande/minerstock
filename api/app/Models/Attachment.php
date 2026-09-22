<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\Storage;

#[Fillable(['attachable_type', 'attachable_id', 'purpose', 'path', 'original_name', 'mime', 'size', 'uploaded_by'])]
class Attachment extends Model
{
    /** Tipos de documento que aceptan adjuntos, por clave pública → modelo. */
    public const TYPES = [
        'purchase_request' => PurchaseRequest::class,
        'quotation' => Quotation::class,
        'purchase_order' => PurchaseOrder::class,
        'goods_receipt' => GoodsReceipt::class,
        'supplier_return' => SupplierReturn::class,
        'adjustment' => Adjustment::class,
        'supplier_invoice' => SupplierInvoice::class,
        'supplier_payment' => SupplierPayment::class,
        'supplier_credit_note' => SupplierCreditNote::class,
        'shipment' => Shipment::class,
        'shipment_receipt' => ShipmentReceipt::class,
        'issue' => Issue::class,
        'loan' => Loan::class,
    ];

    public function attachable(): MorphTo
    {
        return $this->morphTo();
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** URL relativa (el SPA y el API comparten dominio; en dev el proxy reenvía /storage). */
    public function url(): string
    {
        return '/storage/'.ltrim($this->path, '/');
    }

    protected static function booted(): void
    {
        static::deleted(function (Attachment $a) {
            Storage::disk('public')->delete($a->path);
        });
    }
}
