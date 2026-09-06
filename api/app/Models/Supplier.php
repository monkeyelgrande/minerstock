<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'document_type', 'document_number', 'name', 'contact_name', 'phone', 'email',
    'address', 'city', 'payment_terms_days', 'notes', 'is_active',
])]
class Supplier extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return [
            'payment_terms_days' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
