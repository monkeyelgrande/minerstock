<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * Notificación genérica del sistema (canal database).
 * data: {key, title, body, icon, route, params?}.
 * `key` identifica el asunto para no repetir la misma alerta.
 */
class SystemNotification extends Notification
{
    public function __construct(public readonly array $data) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toDatabase(object $notifiable): array
    {
        return $this->data;
    }
}
