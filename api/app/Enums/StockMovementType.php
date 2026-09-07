<?php

namespace App\Enums;

enum StockMovementType: string
{
    case CompraEntrada = 'compra_entrada';
    case DevolucionProveedorSalida = 'devolucion_proveedor_salida';
    case DespachoSalida = 'despacho_salida';
    case RecepcionPlanillaEntrada = 'recepcion_planilla_entrada';
    case EntregaSalida = 'entrega_salida';
    case PrestamoSalida = 'prestamo_salida';
    case DevolucionPrestamoEntrada = 'devolucion_prestamo_entrada';
    case AjusteEntrada = 'ajuste_entrada';
    case AjusteSalida = 'ajuste_salida';

    public function label(): string
    {
        return match ($this) {
            self::CompraEntrada => 'Recepción de compra',
            self::DevolucionProveedorSalida => 'Devolución a proveedor',
            self::DespachoSalida => 'Despacho (planilla)',
            self::RecepcionPlanillaEntrada => 'Recepción de planilla',
            self::EntregaSalida => 'Vale de salida',
            self::PrestamoSalida => 'Préstamo',
            self::DevolucionPrestamoEntrada => 'Devolución de préstamo',
            self::AjusteEntrada => 'Ajuste (entrada)',
            self::AjusteSalida => 'Ajuste (salida)',
        };
    }

    public function isInbound(): bool
    {
        return in_array($this, [
            self::CompraEntrada, self::RecepcionPlanillaEntrada, self::DevolucionPrestamoEntrada, self::AjusteEntrada,
        ], true);
    }
}
