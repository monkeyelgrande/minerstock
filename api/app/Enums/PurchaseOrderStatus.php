<?php

namespace App\Enums;

enum PurchaseOrderStatus: string
{
    case Borrador = 'borrador';
    case PendienteAprobacion = 'pendiente_aprobacion';
    case Aprobada = 'aprobada';
    case Rechazada = 'rechazada';
    case Emitida = 'emitida';
    case RecibidaParcial = 'recibida_parcial';
    case Recibida = 'recibida';
    case Cerrada = 'cerrada';
    case Anulada = 'anulada';

    public function label(): string
    {
        return match ($this) {
            self::Borrador => 'Borrador',
            self::PendienteAprobacion => 'Pendiente de aprobación',
            self::Aprobada => 'Aprobada',
            self::Rechazada => 'Rechazada',
            self::Emitida => 'Emitida',
            self::RecibidaParcial => 'Recibida parcial',
            self::Recibida => 'Recibida',
            self::Cerrada => 'Cerrada',
            self::Anulada => 'Anulada',
        };
    }

    public function isEditable(): bool
    {
        return in_array($this, [self::Borrador, self::Rechazada], true);
    }

    /** La OC compromete cantidades de las solicitudes a partir de la aprobación. */
    public function commitsQuantities(): bool
    {
        return in_array($this, [self::Aprobada, self::Emitida, self::RecibidaParcial, self::Recibida, self::Cerrada], true);
    }

    /** Puede recibir mercancía (fase 2). */
    public function canReceive(): bool
    {
        return in_array($this, [self::Emitida, self::RecibidaParcial], true);
    }
}
