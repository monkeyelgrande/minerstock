<?php

namespace App\Enums;

enum ShipmentStatus: string
{
    case Borrador = 'borrador';
    case Despachada = 'despachada';
    case RecibidaParcial = 'recibida_parcial';
    case Recibida = 'recibida';
    case Cerrada = 'cerrada';
    case Anulada = 'anulada';

    public function label(): string
    {
        return match ($this) {
            self::Borrador => 'Borrador',
            self::Despachada => 'Despachada (en tránsito)',
            self::RecibidaParcial => 'Recibida parcial',
            self::Recibida => 'Recibida',
            self::Cerrada => 'Cerrada',
            self::Anulada => 'Anulada',
        };
    }

    public function isEditable(): bool
    {
        return $this === self::Borrador;
    }

    /** Hay mercancía en camino (cuenta para "en tránsito"). */
    public function isInTransit(): bool
    {
        return in_array($this, [self::Despachada, self::RecibidaParcial], true);
    }

    /** El destino puede registrar recepciones. */
    public function canReceive(): bool
    {
        return in_array($this, [self::Despachada, self::RecibidaParcial], true);
    }
}
