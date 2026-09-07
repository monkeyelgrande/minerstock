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

#[Fillable(['warehouse_id', 'date', 'reason', 'status', 'stock_count_id', 'notes', 'confirmed_at', 'created_by'])]
class Adjustment extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'AJ';

    public const REASONS = [
        'daño' => 'Daño',
        'perdida' => 'Pérdida',
        'correccion' => 'Corrección',
        'vencimiento' => 'Vencimiento',
        'conteo' => 'Conteo físico',
        'devolucion_prestamo_danada' => 'Devolución de préstamo dañada',
        'inventario_inicial' => 'Inventario inicial',
        'otro' => 'Otro',
    ];

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
        return $this->hasMany(AdjustmentItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function stockCount(): BelongsTo
    {
        return $this->belongsTo(StockCount::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'source');
    }

    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->seesAllWarehouses()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->pluck('warehouses.id'));
    }
}
