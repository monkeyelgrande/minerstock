<?php

namespace App\Enums;

enum PurchaseRequestStatus: string
{
    case Borrador = 'borrador';
    case Enviada = 'enviada';
    case Aprobada = 'aprobada';
    case Rechazada = 'rechazada';
    case EnProceso = 'en_proceso';
    case Atendida = 'atendida';
    case Cerrada = 'cerrada';
    case Anulada = 'anulada';

    public function label(): string
    {
        return match ($this) {
            self::Borrador => 'Borrador',
            self::Enviada => 'Pendiente de aprobación',
            self::Aprobada => 'Aprobada',
            self::Rechazada => 'Rechazada',
            self::EnProceso => 'En proceso',
            self::Atendida => 'Atendida',
            self::Cerrada => 'Cerrada',
            self::Anulada => 'Anulada',
        };
    }

    /** Estados en los que la solicitud aún puede editarse. */
    public function isEditable(): bool
    {
        return in_array($this, [self::Borrador, self::Rechazada], true);
    }

    /** Estados en los que sus ítems pueden cotizarse / ordenarse. */
    public function isOpenForPurchasing(): bool
    {
        return in_array($this, [self::Aprobada, self::EnProceso], true);
    }
}
