<?php

namespace App\Console\Commands;

use App\Models\Loan;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\SupplierInvoice;
use App\Services\Notifications\NotifierService;
use Illuminate\Console\Command;

/**
 * Alertas derivadas del estado actual: stock bajo mínimo, facturas próximas a
 * vencer o vencidas y préstamos vencidos. Idempotente: NotifierService no repite
 * una alerta con la misma clave mientras siga sin leer. Programado a diario;
 * también puede correrse a mano.
 */
class SendDailyAlerts extends Command
{
    protected $signature = 'minerstock:alerts';

    protected $description = 'Genera las notificaciones de stock mínimo, facturas por vencer y préstamos vencidos';

    public function handle(NotifierService $notifier): int
    {
        $this->belowMinimum($notifier);
        $this->invoicesDue($notifier);
        $this->overdueLoans($notifier);

        $this->info('Alertas generadas.');

        return self::SUCCESS;
    }

    private function belowMinimum(NotifierService $notifier): void
    {
        $balances = StockBalance::query()->with('warehouse')->get();
        $products = Product::query()->whereIn('id', $balances->pluck('product_id')->unique())
            ->with('warehouseSettings')->get()->keyBy('id');

        $byWarehouse = [];
        foreach ($balances as $b) {
            $p = $products[$b->product_id] ?? null;
            if (! $p) {
                continue;
            }
            $setting = $p->warehouseSettings->firstWhere('warehouse_id', $b->warehouse_id);
            $min = $setting ? (float) $setting->min_stock : (float) $p->default_min_stock;
            if ($min > 0 && (float) $b->qty < $min) {
                $byWarehouse[$b->warehouse_id]['warehouse'] = $b->warehouse;
                $byWarehouse[$b->warehouse_id]['count'] = ($byWarehouse[$b->warehouse_id]['count'] ?? 0) + 1;
            }
        }

        foreach ($byWarehouse as $warehouseId => $info) {
            $count = $info['count'];
            $notifier->notify('stock.view', [
                'key' => 'stock-min-'.$warehouseId.'-'.today()->format('Ymd'),
                'title' => 'Productos bajo el stock mínimo',
                'body' => "{$count} ".($count === 1 ? 'producto' : 'productos')." bajo mínimo en {$info['warehouse']->name}",
                'icon' => 'warning',
                'route' => '/inventario/stock',
                'params' => ['below_min' => 1, 'warehouse_id' => $warehouseId],
            ], null, $warehouseId);
        }
    }

    private function invoicesDue(NotifierService $notifier): void
    {
        $open = SupplierInvoice::query()->with('supplier')
            ->whereIn('status', ['pendiente', 'parcial'])
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', today()->addDays(7))
            ->get();

        $overdue = $open->filter(fn ($i) => $i->due_date->isBefore(today()));
        $dueSoon = $open->filter(fn ($i) => ! $i->due_date->isBefore(today()));

        if ($overdue->isNotEmpty()) {
            $notifier->notify('supplier_payments.create', [
                'key' => 'invoices-overdue-'.today()->format('Ymd'),
                'title' => 'Facturas vencidas por pagar',
                'body' => $overdue->count().' '.($overdue->count() === 1 ? 'factura vencida' : 'facturas vencidas').' · $ '.number_format($overdue->sum(fn ($i) => $i->balance()), 0, ',', '.'),
                'icon' => 'event_busy',
                'route' => '/pagos/facturas',
                'params' => ['status' => 'vencida'],
            ]);
        }
        if ($dueSoon->isNotEmpty()) {
            $notifier->notify('supplier_payments.create', [
                'key' => 'invoices-due-soon-'.today()->format('Ymd'),
                'title' => 'Facturas próximas a vencer',
                'body' => $dueSoon->count().' '.($dueSoon->count() === 1 ? 'factura vence' : 'facturas vencen').' en los próximos 7 días',
                'icon' => 'schedule',
                'route' => '/pagos/facturas',
            ]);
        }
    }

    private function overdueLoans(NotifierService $notifier): void
    {
        $byWarehouse = Loan::query()->with('warehouse')->overdue()->get()->groupBy('warehouse_id');

        foreach ($byWarehouse as $warehouseId => $loans) {
            $count = $loans->count();
            $notifier->notify('loans.update', [
                'key' => 'loans-overdue-'.$warehouseId.'-'.today()->format('Ymd'),
                'title' => 'Préstamos vencidos',
                'body' => "{$count} ".($count === 1 ? 'préstamo vencido' : 'préstamos vencidos')." en {$loans->first()->warehouse->name}",
                'icon' => 'handshake',
                'route' => '/bodega/prestamos',
                'params' => ['overdue' => 1],
            ], null, (int) $warehouseId);
        }
    }
}
