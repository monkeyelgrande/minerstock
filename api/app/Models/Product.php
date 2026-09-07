<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'sku', 'name', 'description', 'category_id', 'base_unit_id', 'kind',
    'default_min_stock', 'barcode', 'image_path', 'is_active',
])]
class Product extends Model
{
    use LogsChanges;

    public const KIND_CONSUMIBLE = 'consumible';

    public const KIND_RETORNABLE = 'retornable';

    protected function casts(): array
    {
        return [
            'default_min_stock' => 'decimal:3',
            'is_active' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'base_unit_id');
    }

    /** Unidades alternas con factor de conversión a la unidad base. */
    public function units(): HasMany
    {
        return $this->hasMany(ProductUnit::class);
    }

    /** Parámetros (mínimos/máximos) por bodega. */
    public function warehouseSettings(): HasMany
    {
        return $this->hasMany(WarehouseProduct::class);
    }

    /** Saldos de stock por bodega. */
    public function stockBalances(): HasMany
    {
        return $this->hasMany(StockBalance::class);
    }

    /**
     * Devuelve el factor de conversión de la unidad dada hacia la unidad base.
     * La unidad base siempre tiene factor 1.
     */
    public function factorFor(int $unitId): ?float
    {
        if ($unitId === (int) $this->base_unit_id) {
            return 1.0;
        }

        $alt = $this->units->firstWhere('unit_id', $unitId);

        return $alt ? (float) $alt->factor : null;
    }
}
