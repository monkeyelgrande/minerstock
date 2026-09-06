<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Models\Supplier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierController extends CrudController
{
    protected string $model = Supplier::class;

    protected array $searchable = ['name', 'document_number', 'contact_name', 'city'];

    protected array $sortable = ['id', 'name', 'document_number', 'city', 'created_at'];

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'document_type' => ['required', 'string', 'max:10'],
            'document_number' => ['required', 'string', 'max:30', Rule::unique('suppliers', 'document_number')->ignore($model?->id)],
            'name' => ['required', 'string', 'max:160'],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'payment_terms_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
