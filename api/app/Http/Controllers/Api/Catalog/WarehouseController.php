<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Http\Resources\WarehouseResource;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WarehouseController extends CrudController
{
    protected string $model = Warehouse::class;

    protected string $resource = WarehouseResource::class;

    protected array $searchable = ['name', 'code'];

    protected array $with = ['site'];

    protected array $sortable = ['id', 'code', 'name', 'created_at'];

    protected function applyFilters(Builder $query, Request $request): void
    {
        if ($siteId = $request->query('site_id')) {
            $query->where('site_id', $siteId);
        }
    }

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'site_id' => ['required', 'integer', Rule::exists('sites', 'id')],
            'code' => ['required', 'string', 'max:20', Rule::unique('warehouses', 'code')->ignore($model?->id)],
            'name' => ['required', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
