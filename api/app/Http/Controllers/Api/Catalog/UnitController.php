<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Models\Unit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UnitController extends CrudController
{
    protected string $model = Unit::class;

    protected array $searchable = ['code', 'name'];

    protected array $sortable = ['id', 'code', 'name', 'created_at'];

    protected string $defaultSort = 'code';

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'code' => ['required', 'string', 'max:10', 'alpha_num:ascii', Rule::unique('units', 'code')->ignore($model?->id)],
            'name' => ['required', 'string', 'max:60'],
            'allows_decimals' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
