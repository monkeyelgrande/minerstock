<?php

namespace App\Models\Concerns;

use App\Models\DocumentSequence;

/**
 * Asigna el consecutivo (`number`) al crear el documento.
 * El modelo debe definir `public const DOC_TYPE = 'XX'`.
 */
trait HasDocumentNumber
{
    public static function bootHasDocumentNumber(): void
    {
        static::creating(function ($model) {
            if (empty($model->number)) {
                $model->number = DocumentSequence::next(static::DOC_TYPE);
            }
        });
    }
}
