<?php

namespace App\Enums;

enum StockCountStatus: string
{
    case EnProceso = 'en_proceso';
    case Cerrado = 'cerrado';
    case Anulado = 'anulado';

    public function label(): string
    {
        return match ($this) {
            self::EnProceso => 'En proceso',
            self::Cerrado => 'Cerrado',
            self::Anulado => 'Anulado',
        };
    }
}
