<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Regla de negocio incumplida (transición de estado inválida, cantidad no disponible, ...).
 * Se responde como 422 con el mensaje tal cual para mostrarlo al usuario.
 */
class DomainException extends RuntimeException {}
