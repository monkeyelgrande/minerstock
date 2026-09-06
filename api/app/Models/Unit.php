<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['code', 'name', 'allows_decimals', 'is_active'])]
class Unit extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return [
            'allows_decimals' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
