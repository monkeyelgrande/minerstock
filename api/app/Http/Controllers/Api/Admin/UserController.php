<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\CrudController;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends CrudController
{
    protected string $model = User::class;

    protected string $resource = UserResource::class;

    protected array $searchable = ['name', 'username', 'email'];

    protected array $with = ['roles', 'warehouses'];

    protected array $sortable = ['id', 'name', 'email', 'last_login_at', 'created_at'];

    protected array $nested = ['roles', 'warehouse_ids'];

    protected function applyFilters(Builder $query, Request $request): void
    {
        if ($role = $request->query('role')) {
            $query->whereHas('roles', fn ($q) => $q->where('name', $role));
        }
    }

    protected function rules(Request $request, ?Model $model): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'username' => ['nullable', 'string', 'max:40', 'alpha_dash:ascii', Rule::unique('users', 'username')->ignore($model?->id)],
            'email' => ['required', 'email', 'max:160', Rule::unique('users', 'email')->ignore($model?->id)],
            'phone' => ['nullable', 'string', 'max:40'],
            'password' => [$model ? 'nullable' : 'required', 'string', 'min:8'],
            'is_active' => ['sometimes', 'boolean'],
            'default_warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['string', Rule::exists('roles', 'name')],
            'warehouse_ids' => ['sometimes', 'array'],
            'warehouse_ids.*' => ['integer', Rule::exists('warehouses', 'id')],
        ];
    }

    protected function onlyModelAttributes(array $data): array
    {
        $attrs = parent::onlyModelAttributes($data);
        if (empty($attrs['password'])) {
            unset($attrs['password']);
        }

        return $attrs;
    }

    protected function afterSave(Model $model, array $data, Request $request): void
    {
        /** @var User $model */
        $model->syncRoles($data['roles']);
        if (array_key_exists('warehouse_ids', $data)) {
            $model->warehouses()->sync($data['warehouse_ids']);
        }
    }

    public function destroy(int $id): JsonResponse
    {
        if ((int) request()->user()->id === $id) {
            return response()->json(['message' => 'No puedes eliminar tu propio usuario.'], 422);
        }

        return parent::destroy($id);
    }

    public function resetPassword(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'min:8']]);
        $user = User::query()->findOrFail($id);
        $user->forceFill(['password' => $data['password']])->save();
        $user->tokens()->delete();

        return response()->json(['message' => 'Contraseña restablecida. Las sesiones del usuario fueron cerradas.']);
    }
}
