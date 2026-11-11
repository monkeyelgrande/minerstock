<?php

namespace App\Services\Notifications;

use App\Models\User;
use App\Notifications\SystemNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Punto único para generar notificaciones del sistema.
 * Destinatarios = usuarios activos con el permiso dado (y, si aplica, asignados
 * a la bodega). `key` evita duplicar la misma alerta mientras siga sin leer.
 */
class NotifierService
{
    /**
     * @param  string|array  $permission  permiso(s) que debe tener el destinatario
     */
    public function notify(
        string|array $permission,
        array $data,
        ?User $except = null,
        ?int $warehouseId = null,
    ): void {
        $users = User::query()
            ->where('is_active', true)
            ->permission($permission)
            ->when($except, fn ($q) => $q->where('id', '!=', $except->id))
            ->with('roles')
            ->get();

        if ($warehouseId !== null) {
            $users = $users->filter(
                fn (User $u) => $u->seesAllWarehouses()
                    || $u->warehouses()->where('warehouses.id', $warehouseId)->exists()
            );
        }

        $this->send($users, $data);
    }

    /** @param  Collection<int, User>|array  $users */
    public function send(Collection|array $users, array $data): void
    {
        $key = $data['key'] ?? null;

        foreach ($users as $user) {
            if ($key !== null && $this->alreadyNotified($user, $key)) {
                continue;
            }
            $user->notify(new SystemNotification($data));
        }
    }

    /** Ya tiene esta alerta sin leer (o leída hace menos de un día): no repetir. */
    private function alreadyNotified(User $user, string $key): bool
    {
        return DB::table('notifications')
            ->where('notifiable_type', $user->getMorphClass())
            ->where('notifiable_id', $user->getKey())
            ->where('data', 'like', '%"key":'.json_encode($key).'%')
            ->where(fn ($q) => $q->whereNull('read_at')->orWhere('read_at', '>=', now()->subDay()))
            ->exists();
    }
}
