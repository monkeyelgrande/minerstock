<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Http\Resources\ProductCategoryResource;
use App\Models\ProductCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductCategoryController extends CrudController
{
    protected string $model = ProductCategory::class;

    protected string $resource = ProductCategoryResource::class;

    protected array $with = ['parent'];

    protected function applyFilters(Builder $query, Request $request): void
    {
        if ($request->has('parent_id')) {
            $parent = $request->query('parent_id');
            $parent === '' || $parent === 'null' ? $query->whereNull('parent_id') : $query->where('parent_id', $parent);
        }
        $query->withCount('products');
    }

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'parent_id' => [
                'nullable', 'integer', Rule::exists('product_categories', 'id'),
                $model ? Rule::notIn([$model->id]) : 'nullable',
            ],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
