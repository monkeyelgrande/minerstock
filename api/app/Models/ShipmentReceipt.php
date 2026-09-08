<?php

namespace App\Models;

use App\Enums\SimpleDocStatus;
use App\Models\Concerns\HasAttachments;
use App\Models\Concerns\HasDocumentNumber;
use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\MorphMany;

#[Fillable(['shipment_id', 'received_at', 'received_by', 'status', 'notes', 'confirmed_at', 'created_by'])]
class ShipmentReceipt extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'RM';

    /** Propósito del adjunto obligatorio para confirmar. */
    public const SIGNED_SHEET_PURPOSE = 'planilla_firmada';

    protected function casts(): array
    {
        return [
            'status' => SimpleDocStatus::class,
            'received_at' => 'date:Y-m-d',
            'confirmed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(ShipmentReceiptItem::class)->orderBy('id');
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function novelties(): HasManyThrough
    {
        return $this->hasManyThrough(ShipmentNovelty::class, ShipmentReceiptItem::class);
    }

    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'source');
    }

    public function hasSignedSheet(): bool
    {
        return $this->attachments()->where('purpose', self::SIGNED_SHEET_PURPOSE)->exists();
    }
}
