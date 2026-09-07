<?php

namespace App\Enums;

/** Estados de documentos de inventario de un solo paso: borrador → confirmado → anulado. */
enum SimpleDocStatus: string
{
    case Borrador = 'borrador';
    case Confirmado = 'confirmado';
    case Anulado = 'anulado';

    public function label(string $gender = 'm'): string
    {
        $f = $gender === 'f';

        return match ($this) {
            self::Borrador => 'Borrador',
            self::Confirmado => $f ? 'Confirmada' : 'Confirmado',
            self::Anulado => $f ? 'Anulada' : 'Anulado',
        };
    }

    public function isEditable(): bool
    {
        return $this === self::Borrador;
    }
}
