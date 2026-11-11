<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

use Illuminate\Support\Facades\Schedule;

// Alertas diarias: stock bajo mínimo, facturas por vencer, préstamos vencidos.
Schedule::command('minerstock:alerts')->dailyAt('06:00');
