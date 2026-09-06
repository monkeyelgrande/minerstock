<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'document_number', 'name', 'phone', 'license_number', 'license_category',
    'license_expires_at', 'is_active',
])]
class Driver extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return [
            'license_expires_at' => 'date:Y-m-d',
            'is_active' => 'boolean',
        ];
    }
}
