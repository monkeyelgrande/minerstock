<?php

return [
    /*
     * Roles del sistema y su etiqueta para la interfaz.
     * Los permisos se definen en database/seeders/RolePermissionSeeder.php.
     */
    'roles' => [
        'admin' => 'Administrador',
        'solicitante' => 'Solicitante',
        'aprobador' => 'Aprobador',
        'comprador' => 'Comprador',
        'tesoreria' => 'Tesorería',
        'bodeguero' => 'Bodeguero',
        'consulta' => 'Consulta',
    ],

    /*
     * Tipos de documento con consecutivo global.
     */
    'document_types' => [
        'SC' => ['name' => 'Solicitud de compra', 'prefix' => 'SC-'],
        'CO' => ['name' => 'Cotización', 'prefix' => 'CO-'],
        'OC' => ['name' => 'Orden de compra', 'prefix' => 'OC-'],
        'RC' => ['name' => 'Recepción de compra', 'prefix' => 'RC-'],
        'DV' => ['name' => 'Devolución a proveedor', 'prefix' => 'DV-'],
        'FP' => ['name' => 'Factura de proveedor', 'prefix' => 'FP-'],
        'PG' => ['name' => 'Pago a proveedor', 'prefix' => 'PG-'],
        'NC' => ['name' => 'Nota crédito', 'prefix' => 'NC-'],
        'PL' => ['name' => 'Planilla de viaje', 'prefix' => 'PL-'],
        'RM' => ['name' => 'Recepción en mina', 'prefix' => 'RM-'],
        'VS' => ['name' => 'Vale de salida', 'prefix' => 'VS-'],
        'PR' => ['name' => 'Préstamo', 'prefix' => 'PR-'],
        'AJ' => ['name' => 'Ajuste de inventario', 'prefix' => 'AJ-'],
        'CF' => ['name' => 'Conteo físico', 'prefix' => 'CF-'],
    ],
];
