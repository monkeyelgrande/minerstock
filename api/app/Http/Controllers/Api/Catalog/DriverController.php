<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Models\Driver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DriverController extends CrudController
{
    protected string $model = Driver::class;

    protected array $searchable = ['name', 'document_number', 'license_number'];

    protected array $sortable = ['id', 'name', 'document_number', 'license_expires_at', 'created_at'];

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'document_number' => ['required', 'string', 'max:30', Rule::unique('drivers', 'document_number')->ignore($model?->id)],
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'license_number' => ['nullable', 'string', 'max:40'],
            'license_category' => ['nullable', 'string', 'max:10'],
            'license_expires_at' => ['nullable', 'date'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
