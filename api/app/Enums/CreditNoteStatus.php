<?php

namespace App\Enums;

enum CreditNoteStatus: string
{
    case Disponible = 'disponible';
    case Aplicada = 'aplicada';
    case Anulada = 'anulada';

    public function label(): string
    {
        return match ($this) {
            self::Disponible => 'Disponible',
            self::Aplicada => 'Aplicada',
            self::Anulada => 'Anulada',
        };
    }
}
