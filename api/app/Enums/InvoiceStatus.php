<?php

namespace App\Enums;

enum InvoiceStatus: string
{
    case Pendiente = 'pendiente';
    case Parcial = 'parcial';
    case Pagada = 'pagada';
    case Anulada = 'anulada';

    public function label(): string
    {
        return match ($this) {
            self::Pendiente => 'Pendiente',
            self::Parcial => 'Pago parcial',
            self::Pagada => 'Pagada',
            self::Anulada => 'Anulada',
        };
    }

    /** Puede recibir pagos o notas crédito. */
    public function isOpen(): bool
    {
        return in_array($this, [self::Pendiente, self::Parcial], true);
    }
}
