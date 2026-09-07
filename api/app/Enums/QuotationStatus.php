<?php

namespace App\Enums;

enum QuotationStatus: string
{
    case Borrador = 'borrador';
    case Recibida = 'recibida';
    case Seleccionada = 'seleccionada';
    case Descartada = 'descartada';

    public function label(): string
    {
        return match ($this) {
            self::Borrador => 'Borrador',
            self::Recibida => 'Recibida',
            self::Seleccionada => 'Seleccionada',
            self::Descartada => 'Descartada',
        };
    }

    public function isEditable(): bool
    {
        return in_array($this, [self::Borrador, self::Recibida], true);
    }

    /** Participa en la comparativa. */
    public function isComparable(): bool
    {
        return in_array($this, [self::Recibida, self::Seleccionada], true);
    }
}
