<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends CrudController
{
    protected string $model = Product::class;

    protected string $resource = ProductResource::class;

    protected array $searchable = ['sku', 'name', 'barcode'];

    protected array $with = ['category', 'baseUnit', 'units.unit', 'warehouseSettings.warehouse'];

    protected array $sortable = ['id', 'sku', 'name', 'kind', 'created_at'];

    protected array $nested = ['units', 'warehouse_settings'];

    protected function applyFilters(Builder $query, Request $request): void
    {
        if ($categoryId = $request->query('category_id')) {
            $query->where('category_id', $categoryId);
        }
        if ($kind = $request->query('kind')) {
            $query->where('kind', $kind);
        }
    }

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'sku' => ['required', 'string', 'max:40', Rule::unique('products', 'sku')->ignore($model?->id)],
            'name' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string'],
            'category_id' => ['nullable', 'integer', Rule::exists('product_categories', 'id')],
            'base_unit_id' => ['required', 'integer', Rule::exists('units', 'id')],
            'kind' => ['required', Rule::in([Product::KIND_CONSUMIBLE, Product::KIND_RETORNABLE])],
            'default_min_stock' => ['nullable', 'numeric', 'min:0'],
            'barcode' => ['nullable', 'string', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],

            'units' => ['sometimes', 'array'],
            'units.*.unit_id' => ['required', 'integer', Rule::exists('units', 'id'), 'different:base_unit_id'],
            'units.*.factor' => ['required', 'numeric', 'gt:0'],
            'units.*.is_default_purchase' => ['sometimes', 'boolean'],

            'warehouse_settings' => ['sometimes', 'array'],
            'warehouse_settings.*.warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'warehouse_settings.*.min_stock' => ['nullable', 'numeric', 'min:0'],
            'warehouse_settings.*.max_stock' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    protected function afterSave(Model $model, array $data, Request $request): void
    {
        /** @var Product $model */
        if (array_key_exists('units', $data)) {
            $units = collect($data['units'])->unique('unit_id');
            $model->units()->whereNotIn('unit_id', $units->pluck('unit_id'))->delete();
            foreach ($units as $u) {
                $model->units()->updateOrCreate(
                    ['unit_id' => $u['unit_id']],
                    ['factor' => $u['factor'], 'is_default_purchase' => (bool) ($u['is_default_purchase'] ?? false)]
                );
            }
        }

        if (array_key_exists('warehouse_settings', $data)) {
            $settings = collect($data['warehouse_settings'])->unique('warehouse_id');
            $model->warehouseSettings()->whereNotIn('warehouse_id', $settings->pluck('warehouse_id'))->delete();
            foreach ($settings as $s) {
                $model->warehouseSettings()->updateOrCreate(
                    ['warehouse_id' => $s['warehouse_id']],
                    ['min_stock' => $s['min_stock'] ?? 0, 'max_stock' => $s['max_stock'] ?? null]
                );
            }
        }
    }
}
