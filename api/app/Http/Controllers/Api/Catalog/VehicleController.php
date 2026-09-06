<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VehicleController extends CrudController
{
    protected string $model = Vehicle::class;

    protected array $searchable = ['plate', 'type', 'brand', 'owner_name'];

    protected array $sortable = ['id', 'plate', 'type', 'created_at'];

    protected string $defaultSort = 'plate';

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'plate' => ['required', 'string', 'max:15', Rule::unique('vehicles', 'plate')->ignore($model?->id)],
            'type' => ['required', 'string', 'max:40'],
            'brand' => ['nullable', 'string', 'max:60'],
            'capacity_kg' => ['nullable', 'numeric', 'min:0'],
            'ownership' => ['required', Rule::in(['propio', 'tercero'])],
            'owner_name' => ['nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
