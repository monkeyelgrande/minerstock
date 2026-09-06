<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['warehouse_id', 'product_id', 'min_stock', 'max_stock'])]
class WarehouseProduct extends Model
{
    protected $table = 'warehouse_product';

    protected function casts(): array
    {
        return [
            'min_stock' => 'decimal:3',
            'max_stock' => 'decimal:3',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
