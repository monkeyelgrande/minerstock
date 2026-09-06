<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'email' => $this->email,
            'phone' => $this->phone,
            'is_active' => $this->is_active,
            'default_warehouse_id' => $this->default_warehouse_id,
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->pluck('name')->values()),
            'permissions' => $this->when(
                $request->routeIs('auth.*') || $request->routeIs('admin.users.*'),
                fn () => $this->getAllPermissions()->pluck('name')->values()
            ),
            'warehouses' => $this->whenLoaded('warehouses', fn () => $this->warehouses->map(fn ($w) => [
                'id' => $w->id,
                'code' => $w->code,
                'name' => $w->name,
                'site_id' => $w->site_id,
            ])->values()),
            'sees_all_warehouses' => $this->seesAllWarehouses(),
            'last_login_at' => $this->last_login_at,
            'created_at' => $this->created_at,
        ];
    }
}
