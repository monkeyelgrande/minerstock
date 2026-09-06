<?php

namespace App\Http\Controllers\Api\Catalog;

use App\Http\Controllers\Api\CrudController;
use App\Http\Resources\RecipientResource;
use App\Models\Recipient;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RecipientController extends CrudController
{
    protected string $model = Recipient::class;

    protected string $resource = RecipientResource::class;

    protected array $searchable = ['name', 'document_number'];

    protected array $with = ['costCenter', 'site'];

    protected array $sortable = ['id', 'name', 'type', 'created_at'];

    protected function applyFilters(Builder $query, Request $request): void
    {
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        if ($siteId = $request->query('site_id')) {
            $query->where('site_id', $siteId);
        }
    }

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'type' => ['required', Rule::in(['persona', 'area'])],
            'name' => ['required', 'string', 'max:120'],
            'document_number' => ['nullable', 'string', 'max:30'],
            'phone' => ['nullable', 'string', 'max:40'],
            'cost_center_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')],
            'site_id' => ['nullable', 'integer', Rule::exists('sites', 'id')],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
