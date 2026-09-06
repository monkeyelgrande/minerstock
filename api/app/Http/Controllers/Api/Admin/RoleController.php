<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $roles = Role::query()->with('permissions')->orderBy('id')->get()->map(fn (Role $r) => [
            'id' => $r->id,
            'name' => $r->name,
            'label' => config("minerstock.roles.{$r->name}", $r->name),
            'permissions' => $r->permissions->pluck('name')->values(),
            'users_count' => $r->users()->count(),
        ]);

        return response()->json(['data' => $roles]);
    }

    public function permissions(): JsonResponse
    {
        $perms = Permission::query()->orderBy('name')->pluck('name')->groupBy(fn ($p) => explode('.', $p)[0]);

        return response()->json(['data' => $perms]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $role = Role::query()->findOrFail($id);
        $data = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')],
        ]);

        if ($role->name === 'admin') {
            return response()->json(['message' => 'El rol administrador siempre tiene todos los permisos.'], 422);
        }

        $role->syncPermissions($data['permissions']);

        return response()->json(['message' => 'Permisos actualizados.']);
    }
}
