<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Models\Site;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SiteController extends CrudController
{
    protected string $model = Site::class;

    protected array $searchable = ['name', 'address'];

    protected array $sortable = ['id', 'name', 'type', 'created_at'];

    protected function applyFilters(Builder $query, Request $request): void
    {
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        $query->withCount('warehouses');
    }

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(['municipio', 'mina'])],
            'address' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
