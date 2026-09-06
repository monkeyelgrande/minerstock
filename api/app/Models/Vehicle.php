<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['plate', 'type', 'brand', 'capacity_kg', 'ownership', 'owner_name', 'is_active'])]
class Vehicle extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return [
            'capacity_kg' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }
}
