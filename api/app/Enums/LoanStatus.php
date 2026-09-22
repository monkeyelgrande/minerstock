<?php

namespace App\Enums;

enum LoanStatus: string
{
    case Borrador = 'borrador';
    case Abierto = 'abierto';
    case Parcial = 'parcial';
    case Devuelto = 'devuelto';
    case CerradoConPerdida = 'cerrado_con_perdida';
    case Anulado = 'anulado';

    public function label(): string
    {
        return match ($this) {
            self::Borrador => 'Borrador',
            self::Abierto => 'Abierto',
            self::Parcial => 'Devuelto parcial',
            self::Devuelto => 'Devuelto',
            self::CerradoConPerdida => 'Cerrado con pérdida',
            self::Anulado => 'Anulado',
        };
    }

    public function isEditable(): bool
    {
        return $this === self::Borrador;
    }

    /** Con saldo en poder del receptor: acepta devoluciones. */
    public function isOpen(): bool
    {
        return in_array($this, [self::Abierto, self::Parcial], true);
    }
}
