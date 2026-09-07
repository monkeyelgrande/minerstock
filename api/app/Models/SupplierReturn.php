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

#[Fillable([
    'supplier_id', 'goods_receipt_id', 'warehouse_id', 'date', 'reason', 'status', 'total_cost',
    'notes', 'confirmed_at', 'created_by',
])]
class SupplierReturn extends Model
{
    use HasAttachments, HasDocumentNumber, LogsChanges;

    public const DOC_TYPE = 'DV';

    public const REASONS = [
        'defectuoso' => 'Producto defectuoso',
        'error_pedido' => 'Error en el pedido',
        'sobrante' => 'Sobrante',
        'vencido' => 'Vencido',
        'otro' => 'Otro',
    ];

    protected function casts(): array
    {
        return [
            'status' => SimpleDocStatus::class,
            'date' => 'date:Y-m-d',
            'total_cost' => 'decimal:2',
            'confirmed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(SupplierReturnItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(GoodsReceipt::class, 'goods_receipt_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
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
