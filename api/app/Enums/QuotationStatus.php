<?php

namespace App\Enums;

enum QuotationStatus: string
{
    case Borrador = 'borrador';
    case Enviada = 'enviada';
    case Recibida = 'recibida';
    case Seleccionada = 'seleccionada';
    case Descartada = 'descartada';

    public function label(): string
    {
        return match ($this) {
            self::Borrador => 'Borrador',
            self::Enviada => 'Enviada al proveedor',
            self::Recibida => 'Respuesta recibida',
            self::Seleccionada => 'Seleccionada',
            self::Descartada => 'Descartada',
        };
    }

    /** Edición completa (ítems, cantidades, proveedor). */
    public function isEditable(): bool
    {
        return in_array($this, [self::Borrador, self::Recibida], true);
    }

    /** Puede registrarse la respuesta del proveedor (precios por ítem). */
    public function canRespond(): bool
    {
        return in_array($this, [self::Enviada, self::Recibida], true);
    }

    /** Participa en la comparativa. */
    public function isComparable(): bool
    {
        return in_array($this, [self::Recibida, self::Seleccionada], true);
    }
}
