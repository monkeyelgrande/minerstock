<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Http\Resources\CostCenterResource;
use App\Models\CostCenter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CostCenterController extends CrudController
{
    protected string $model = CostCenter::class;

    protected string $resource = CostCenterResource::class;

    protected array $searchable = ['code', 'name'];

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
            'code' => ['required', 'string', 'max:20', Rule::unique('cost_centers', 'code')->ignore($model?->id)],
            'name' => ['required', 'string', 'max:120'],
            'site_id' => ['nullable', 'integer', Rule::exists('sites', 'id')],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
