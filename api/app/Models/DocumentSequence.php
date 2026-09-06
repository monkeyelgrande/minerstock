<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

#[Fillable(['doc_type', 'name', 'prefix', 'next_number', 'padding'])]
class DocumentSequence extends Model
{
    protected function casts(): array
    {
        return [
            'next_number' => 'integer',
            'padding' => 'integer',
        ];
    }

    /**
     * Reserva y devuelve el siguiente consecutivo del tipo dado.
     * Debe llamarse dentro de la transacción que crea el documento.
     */
    public static function next(string $docType): string
    {
        return DB::transaction(function () use ($docType) {
            $seq = static::query()->where('doc_type', $docType)->lockForUpdate()->firstOrFail();
            $number = $seq->prefix.str_pad((string) $seq->next_number, $seq->padding, '0', STR_PAD_LEFT);
            $seq->increment('next_number');

            return $number;
        });
    }
}
