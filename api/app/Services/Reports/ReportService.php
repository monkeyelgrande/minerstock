<?php

namespace App\Services\Reports;

use App\Enums\LoanStatus;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\IssueItem;
use App\Models\Loan;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\ShipmentNovelty;
use App\Models\StockBalance;
use App\Models\StockMovement;
use App\Models\SupplierInvoice;
use App\Models\User;
use App\Services\Inventory\StockQueryService;

/**
 * Reportes de la fase 6. Cada reporte devuelve columnas tipadas, filas y totales;
 * el controlador los sirve como JSON o los exporta a XLSX/PDF.
 *
 * Tipos de columna: text | date | qty | money | number.
 */
class ReportService
{
    public function __construct(private readonly StockQueryService $stock) {}

    /** Catálogo: clave → título, descripción y filtros que acepta. */
    public const CATALOG = [
        'kardex' => [
            'title' => 'Kardex valorizado',
            'description' => 'Movimientos de inventario con costo y saldo corrido.',
            'filters' => ['warehouse_id', 'product_id', 'movement_type', 'date_from', 'date_to'],
        ],
        'inventario' => [
            'title' => 'Inventario valorizado',
            'description' => 'Existencias por bodega y categoría al costo promedio.',
            'filters' => ['warehouse_id', 'category_id'],
        ],
        'consumo' => [
            'title' => 'Consumo por centro de costo y receptor',
            'description' => 'Vales de salida confirmados, valorizados.',
            'filters' => ['warehouse_id', 'cost_center_id', 'recipient_id', 'date_from', 'date_to'],
        ],
        'compras' => [
            'title' => 'Compras por proveedor y producto',
            'description' => 'Ítems de órdenes de compra aprobadas o posteriores.',
            'filters' => ['supplier_id', 'product_id', 'warehouse_id', 'date_from', 'date_to'],
        ],
        'precios' => [
            'title' => 'Precios históricos por producto',
            'description' => 'Mínimo, máximo, promedio y último precio de compra en unidad base.',
            'filters' => ['product_id', 'category_id', 'supplier_id', 'date_from', 'date_to'],
        ],
        'novedades' => [
            'title' => 'Novedades de transporte',
            'description' => 'Faltantes, dañados y sobrantes detectados al recibir planillas.',
            'filters' => ['novelty_type', 'novelty_status', 'date_from', 'date_to'],
        ],
        'prestamos-vencidos' => [
            'title' => 'Préstamos vencidos',
            'description' => 'Herramientas en poder de receptores con devolución vencida.',
            'filters' => ['warehouse_id', 'recipient_id'],
        ],
        'cartera' => [
            'title' => 'Cartera por proveedor y vencimientos',
            'description' => 'Facturas abiertas con antigüedad del saldo.',
            'filters' => ['supplier_id', 'date_from', 'date_to'],
        ],
        'solicitudes-pendientes' => [
            'title' => 'Solicitudes pendientes de atender',
            'description' => 'Ítems aprobados aún no ordenados o no despachados por completo.',
            'filters' => ['warehouse_id', 'priority'],
        ],
    ];

    /** @return array{title: string, columns: array, rows: array, totals: array} */
    public function run(string $key, array $f, User $user): array
    {
        if (! isset(self::CATALOG[$key])) {
            throw new DomainException('Reporte no encontrado.');
        }

        $method = 'report'.str_replace('-', '', ucwords($key, '-'));
        $data = $this->{$method}($f, $user);
        $data['title'] = self::CATALOG[$key]['title'];

        return $data;
    }

    /** Bodegas visibles, opcionalmente restringidas al filtro. */
    private function warehouseIds(array $f, User $user): array
    {
        $ids = $this->stock->warehousesFor($user)->pluck('id');
        if (! empty($f['warehouse_id'])) {
            $ids = $ids->intersect([(int) $f['warehouse_id']]);
        }

        return $ids->values()->all();
    }

    private function reportKardex(array $f, User $user): array
    {
        $movements = StockMovement::query()
            ->with(['warehouse', 'product.baseUnit', 'user', 'source'])
            ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
            ->when($f['product_id'] ?? null, fn ($q, $p) => $q->where('product_id', $p))
            ->when($f['movement_type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($f['date_from'] ?? null, fn ($q, $d) => $q->whereDate('moved_at', '>=', $d))
            ->when($f['date_to'] ?? null, fn ($q, $d) => $q->whereDate('moved_at', '<=', $d))
            ->orderBy('moved_at')->orderBy('id')
            ->limit(5000)->get();

        $rows = $movements->map(fn (StockMovement $m) => [
            'fecha' => $m->moved_at?->format('Y-m-d H:i'),
            'bodega' => $m->warehouse->code,
            'producto' => "{$m->product->sku} · {$m->product->name}",
            'tipo' => $m->type->label().($m->is_reversal ? ' (reversa)' : ''),
            'documento' => $m->source?->number ?? '—',
            'entrada' => (float) $m->qty_base > 0 ? (float) $m->qty_base : null,
            'salida' => (float) $m->qty_base < 0 ? abs((float) $m->qty_base) : null,
            'costo_unit' => (float) $m->unit_cost,
            'valor' => (float) $m->total_cost,
            'saldo' => (float) $m->balance_qty_after,
            'saldo_costo' => (float) $m->balance_cost_after,
        ])->all();

        return [
            'columns' => [
                ['key' => 'fecha', 'label' => 'Fecha', 'type' => 'text'],
                ['key' => 'bodega', 'label' => 'Bodega', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'tipo', 'label' => 'Movimiento', 'type' => 'text'],
                ['key' => 'documento', 'label' => 'Documento', 'type' => 'text'],
                ['key' => 'entrada', 'label' => 'Entrada', 'type' => 'qty'],
                ['key' => 'salida', 'label' => 'Salida', 'type' => 'qty'],
                ['key' => 'costo_unit', 'label' => 'Costo unit.', 'type' => 'money'],
                ['key' => 'valor', 'label' => 'Valor', 'type' => 'money'],
                ['key' => 'saldo', 'label' => 'Saldo', 'type' => 'qty'],
                ['key' => 'saldo_costo', 'label' => 'Costo prom.', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => [
                'entrada' => round(array_sum(array_map(fn ($r) => $r['entrada'] ?? 0, $rows)), 3),
                'salida' => round(array_sum(array_map(fn ($r) => $r['salida'] ?? 0, $rows)), 3),
            ],
        ];
    }

    private function reportInventario(array $f, User $user): array
    {
        $balances = StockBalance::query()
            ->with(['warehouse', 'product.baseUnit', 'product.category'])
            ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
            ->where('qty', '>', 0)
            ->when($f['category_id'] ?? null, fn ($q, $c) => $q->whereHas('product', fn ($p) => $p->where('category_id', $c)))
            ->get()
            ->sortBy([
                fn ($a, $b) => strcmp($a->warehouse->code, $b->warehouse->code),
                fn ($a, $b) => strcmp($a->product->category?->name ?? '', $b->product->category?->name ?? ''),
                fn ($a, $b) => strcmp($a->product->name, $b->product->name),
            ]);

        $rows = $balances->map(fn (StockBalance $b) => [
            'bodega' => $b->warehouse->code,
            'categoria' => $b->product->category?->name ?? '—',
            'sku' => $b->product->sku,
            'producto' => $b->product->name,
            'unidad' => $b->product->baseUnit->code,
            'cantidad' => (float) $b->qty,
            'costo_prom' => (float) $b->avg_cost,
            'valor' => round((float) $b->qty * (float) $b->avg_cost, 2),
        ])->values()->all();

        return [
            'columns' => [
                ['key' => 'bodega', 'label' => 'Bodega', 'type' => 'text'],
                ['key' => 'categoria', 'label' => 'Categoría', 'type' => 'text'],
                ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
                ['key' => 'cantidad', 'label' => 'Cantidad', 'type' => 'qty'],
                ['key' => 'costo_prom', 'label' => 'Costo prom.', 'type' => 'money'],
                ['key' => 'valor', 'label' => 'Valor', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => ['valor' => round(array_sum(array_column($rows, 'valor')), 2)],
        ];
    }

    private function reportConsumo(array $f, User $user): array
    {
        $items = IssueItem::query()
            ->with(['issue.warehouse', 'issue.recipient', 'issue.costCenter', 'product.baseUnit'])
            ->whereHas('issue', fn ($q) => $q
                ->where('status', 'confirmado')
                ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
                ->when($f['cost_center_id'] ?? null, fn ($i, $c) => $i->where('cost_center_id', $c))
                ->when($f['recipient_id'] ?? null, fn ($i, $r) => $i->where('recipient_id', $r))
                ->when($f['date_from'] ?? null, fn ($i, $d) => $i->whereDate('date', '>=', $d))
                ->when($f['date_to'] ?? null, fn ($i, $d) => $i->whereDate('date', '<=', $d)))
            ->get()
            ->sortBy(fn ($i) => [$i->issue->date, $i->issue->number]);

        $rows = $items->map(fn (IssueItem $i) => [
            'fecha' => $i->issue->date?->format('Y-m-d'),
            'vale' => $i->issue->number,
            'bodega' => $i->issue->warehouse->code,
            'centro_costo' => $i->issue->costCenter?->name ?? '—',
            'receptor' => $i->issue->recipient->name,
            'producto' => "{$i->product->sku} · {$i->product->name}",
            'cantidad' => (float) $i->qty_base,
            'unidad' => $i->product->baseUnit->code,
            'costo_unit' => (float) $i->unit_cost,
            'valor' => round((float) $i->qty_base * (float) $i->unit_cost, 2),
        ])->values()->all();

        return [
            'columns' => [
                ['key' => 'fecha', 'label' => 'Fecha', 'type' => 'date'],
                ['key' => 'vale', 'label' => 'Vale', 'type' => 'text'],
                ['key' => 'bodega', 'label' => 'Bodega', 'type' => 'text'],
                ['key' => 'centro_costo', 'label' => 'Centro de costo', 'type' => 'text'],
                ['key' => 'receptor', 'label' => 'Receptor', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'cantidad', 'label' => 'Cantidad', 'type' => 'qty'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
                ['key' => 'costo_unit', 'label' => 'Costo unit.', 'type' => 'money'],
                ['key' => 'valor', 'label' => 'Valor', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => ['valor' => round(array_sum(array_column($rows, 'valor')), 2)],
        ];
    }

    private function reportCompras(array $f, User $user): array
    {
        $items = PurchaseOrderItem::query()
            ->with(['order.supplier', 'order.warehouse', 'product.baseUnit'])
            ->whereHas('order', fn ($q) => $q
                ->whereIn('status', ['aprobada', 'emitida', 'recibida_parcial', 'recibida', 'cerrada'])
                ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
                ->when($f['supplier_id'] ?? null, fn ($o, $s) => $o->where('supplier_id', $s))
                ->when($f['date_from'] ?? null, fn ($o, $d) => $o->whereDate('date', '>=', $d))
                ->when($f['date_to'] ?? null, fn ($o, $d) => $o->whereDate('date', '<=', $d)))
            ->when($f['product_id'] ?? null, fn ($q, $p) => $q->where('product_id', $p))
            ->get()
            ->sortBy(fn ($i) => [$i->order->date, $i->order->number]);

        $rows = $items->map(fn (PurchaseOrderItem $i) => [
            'fecha' => $i->order->date?->format('Y-m-d'),
            'oc' => $i->order->number,
            'proveedor' => $i->order->supplier->name,
            'bodega' => $i->order->warehouse->code,
            'producto' => "{$i->product->sku} · {$i->product->name}",
            'cantidad' => (float) $i->qty_base,
            'unidad' => $i->product->baseUnit->code,
            'precio_base' => (float) $i->base_unit_cost,
            'iva' => (float) $i->tax_rate,
            'total' => (float) $i->line_total,
        ])->values()->all();

        return [
            'columns' => [
                ['key' => 'fecha', 'label' => 'Fecha', 'type' => 'date'],
                ['key' => 'oc', 'label' => 'OC', 'type' => 'text'],
                ['key' => 'proveedor', 'label' => 'Proveedor', 'type' => 'text'],
                ['key' => 'bodega', 'label' => 'Bodega', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'cantidad', 'label' => 'Cant. base', 'type' => 'qty'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
                ['key' => 'precio_base', 'label' => 'Precio/u. base', 'type' => 'money'],
                ['key' => 'iva', 'label' => 'IVA %', 'type' => 'number'],
                ['key' => 'total', 'label' => 'Total línea', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => ['total' => round(array_sum(array_column($rows, 'total')), 2)],
        ];
    }

    private function reportPrecios(array $f, User $user): array
    {
        $items = PurchaseOrderItem::query()
            ->with(['order.supplier', 'product.baseUnit', 'product.category'])
            ->whereHas('order', fn ($q) => $q
                ->whereIn('status', ['aprobada', 'emitida', 'recibida_parcial', 'recibida', 'cerrada'])
                ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
                ->when($f['supplier_id'] ?? null, fn ($o, $s) => $o->where('supplier_id', $s))
                ->when($f['date_from'] ?? null, fn ($o, $d) => $o->whereDate('date', '>=', $d))
                ->when($f['date_to'] ?? null, fn ($o, $d) => $o->whereDate('date', '<=', $d)))
            ->when($f['product_id'] ?? null, fn ($q, $p) => $q->where('product_id', $p))
            ->when($f['category_id'] ?? null, fn ($q, $c) => $q->whereHas('product', fn ($p) => $p->where('category_id', $c)))
            ->get();

        $rows = $items
            ->groupBy('product_id')
            ->map(function ($group) {
                $sorted = $group->sortBy(fn ($i) => $i->order->date);
                $last = $sorted->last();
                $p = $last->product;

                return [
                    'sku' => $p->sku,
                    'producto' => $p->name,
                    'categoria' => $p->category?->name ?? '—',
                    'unidad' => $p->baseUnit->code,
                    'compras' => $group->count(),
                    'precio_min' => round((float) $group->min('base_unit_cost'), 2),
                    'precio_prom' => round((float) $group->avg('base_unit_cost'), 2),
                    'precio_max' => round((float) $group->max('base_unit_cost'), 2),
                    'ultimo_precio' => round((float) $last->base_unit_cost, 2),
                    'ultima_fecha' => $last->order->date?->format('Y-m-d'),
                    'ultimo_proveedor' => $last->order->supplier->name,
                ];
            })
            ->sortBy('producto')->values()->all();

        return [
            'columns' => [
                ['key' => 'sku', 'label' => 'SKU', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'categoria', 'label' => 'Categoría', 'type' => 'text'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
                ['key' => 'compras', 'label' => 'Compras', 'type' => 'number'],
                ['key' => 'precio_min', 'label' => 'Mínimo', 'type' => 'money'],
                ['key' => 'precio_prom', 'label' => 'Promedio', 'type' => 'money'],
                ['key' => 'precio_max', 'label' => 'Máximo', 'type' => 'money'],
                ['key' => 'ultimo_precio', 'label' => 'Último precio', 'type' => 'money'],
                ['key' => 'ultima_fecha', 'label' => 'Última compra', 'type' => 'date'],
                ['key' => 'ultimo_proveedor', 'label' => 'Último proveedor', 'type' => 'text'],
            ],
            'rows' => $rows,
            'totals' => [],
        ];
    }

    private function reportNovedades(array $f, User $user): array
    {
        $novelties = ShipmentNovelty::query()
            ->with(['receiptItem.receipt.shipment.origin', 'receiptItem.receipt.shipment.destination', 'receiptItem.receipt.shipment.driver', 'receiptItem.product.baseUnit', 'resolver'])
            ->whereHas('receiptItem.receipt.shipment', fn ($q) => $q->whereIn('destination_warehouse_id', $this->warehouseIds($f, $user)))
            ->when($f['novelty_type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($f['novelty_status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['date_from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($f['date_to'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->orderByDesc('created_at')->limit(2000)->get();

        $rows = $novelties->map(function (ShipmentNovelty $n) {
            $shipment = $n->receiptItem->receipt->shipment;

            return [
                'fecha' => $n->created_at?->format('Y-m-d'),
                'planilla' => $shipment->number,
                'recepcion' => $n->receiptItem->receipt->number,
                'ruta' => "{$shipment->origin->code} → {$shipment->destination->code}",
                'chofer' => $shipment->driver?->name ?? '—',
                'producto' => "{$n->receiptItem->product->sku} · {$n->receiptItem->product->name}",
                'tipo' => ucfirst($n->type),
                'cantidad' => (float) $n->qty_base,
                'unidad' => $n->receiptItem->product->baseUnit->code,
                'estado' => $n->status === 'abierta' ? 'Abierta' : 'Resuelta',
                'resolucion' => $n->resolution ?? '—',
            ];
        })->all();

        return [
            'columns' => [
                ['key' => 'fecha', 'label' => 'Fecha', 'type' => 'date'],
                ['key' => 'planilla', 'label' => 'Planilla', 'type' => 'text'],
                ['key' => 'recepcion', 'label' => 'Recepción', 'type' => 'text'],
                ['key' => 'ruta', 'label' => 'Ruta', 'type' => 'text'],
                ['key' => 'chofer', 'label' => 'Chofer', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'tipo', 'label' => 'Tipo', 'type' => 'text'],
                ['key' => 'cantidad', 'label' => 'Cantidad', 'type' => 'qty'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
                ['key' => 'estado', 'label' => 'Estado', 'type' => 'text'],
                ['key' => 'resolucion', 'label' => 'Resolución', 'type' => 'text'],
            ],
            'rows' => $rows,
            'totals' => [],
        ];
    }

    private function reportPrestamosVencidos(array $f, User $user): array
    {
        $loans = Loan::query()
            ->with(['recipient', 'warehouse', 'items.product.baseUnit'])
            ->overdue()
            ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
            ->when($f['recipient_id'] ?? null, fn ($q, $r) => $q->where('recipient_id', $r))
            ->orderBy('expected_return_at')->get();

        $rows = [];
        foreach ($loans as $loan) {
            foreach ($loan->items as $item) {
                $outstanding = $item->outstandingBase();
                if ($outstanding <= 0) {
                    continue;
                }
                $rows[] = [
                    'receptor' => $loan->recipient->name,
                    'prestamo' => $loan->number,
                    'bodega' => $loan->warehouse->code,
                    'prestado' => $loan->loaned_at?->format('Y-m-d'),
                    'esperado' => $loan->expected_return_at?->format('Y-m-d'),
                    'dias_vencido' => (int) $loan->expected_return_at?->diffInDays(today()),
                    'producto' => "{$item->product->sku} · {$item->product->name}",
                    'en_poder' => $outstanding,
                    'unidad' => $item->product->baseUnit->code,
                    'valor' => round($outstanding * (float) $item->unit_cost, 2),
                ];
            }
        }

        return [
            'columns' => [
                ['key' => 'receptor', 'label' => 'Receptor', 'type' => 'text'],
                ['key' => 'prestamo', 'label' => 'Préstamo', 'type' => 'text'],
                ['key' => 'bodega', 'label' => 'Bodega', 'type' => 'text'],
                ['key' => 'prestado', 'label' => 'Prestado', 'type' => 'date'],
                ['key' => 'esperado', 'label' => 'Devolución esperada', 'type' => 'date'],
                ['key' => 'dias_vencido', 'label' => 'Días vencido', 'type' => 'number'],
                ['key' => 'producto', 'label' => 'Herramienta', 'type' => 'text'],
                ['key' => 'en_poder', 'label' => 'En poder', 'type' => 'qty'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
                ['key' => 'valor', 'label' => 'Valor', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => ['valor' => round(array_sum(array_column($rows, 'valor')), 2)],
        ];
    }

    private function reportCartera(array $f, User $user): array
    {
        $invoices = SupplierInvoice::query()
            ->with('supplier')
            ->whereIn('status', ['pendiente', 'parcial'])
            ->when($f['supplier_id'] ?? null, fn ($q, $s) => $q->where('supplier_id', $s))
            ->when($f['date_from'] ?? null, fn ($q, $d) => $q->whereDate('issue_date', '>=', $d))
            ->when($f['date_to'] ?? null, fn ($q, $d) => $q->whereDate('issue_date', '<=', $d))
            ->get()
            ->sortBy(fn ($i) => [$i->supplier->name, $i->due_date]);

        $buckets = ['corriente' => 0.0, 'v1_30' => 0.0, 'v31_60' => 0.0, 'v60' => 0.0];
        $rows = $invoices->map(function (SupplierInvoice $i) use (&$buckets) {
            $days = $i->due_date !== null && $i->due_date->isBefore(today())
                ? (int) $i->due_date->diffInDays(today())
                : 0;
            $balance = $i->balance();
            $bucket = $days <= 0 ? 'corriente' : ($days <= 30 ? 'v1_30' : ($days <= 60 ? 'v31_60' : 'v60'));
            $buckets[$bucket] += $balance;

            return [
                'proveedor' => $i->supplier->name,
                'factura' => $i->number,
                'factura_proveedor' => $i->supplier_invoice_number,
                'emision' => $i->issue_date?->format('Y-m-d'),
                'vence' => $i->due_date?->format('Y-m-d') ?? '—',
                'dias_vencida' => $days,
                'total' => (float) $i->total,
                'pagado' => (float) $i->paid_amount,
                'nota_credito' => (float) $i->credited_amount,
                'saldo' => $balance,
            ];
        })->values()->all();

        return [
            'columns' => [
                ['key' => 'proveedor', 'label' => 'Proveedor', 'type' => 'text'],
                ['key' => 'factura', 'label' => 'Factura', 'type' => 'text'],
                ['key' => 'factura_proveedor', 'label' => 'Nº proveedor', 'type' => 'text'],
                ['key' => 'emision', 'label' => 'Emisión', 'type' => 'date'],
                ['key' => 'vence', 'label' => 'Vence', 'type' => 'text'],
                ['key' => 'dias_vencida', 'label' => 'Días vencida', 'type' => 'number'],
                ['key' => 'total', 'label' => 'Total', 'type' => 'money'],
                ['key' => 'pagado', 'label' => 'Pagado', 'type' => 'money'],
                ['key' => 'nota_credito', 'label' => 'Nota crédito', 'type' => 'money'],
                ['key' => 'saldo', 'label' => 'Saldo', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => [
                'saldo' => round(array_sum(array_column($rows, 'saldo')), 2),
                'corriente' => round($buckets['corriente'], 2),
                'vencida_1_a_30_días' => round($buckets['v1_30'], 2),
                'vencida_31_a_60_días' => round($buckets['v31_60'], 2),
                'vencida_más_de_60_días' => round($buckets['v60'], 2),
            ],
        ];
    }

    private function reportSolicitudesPendientes(array $f, User $user): array
    {
        $requests = PurchaseRequest::query()
            ->with(['warehouse', 'requester', 'items.product.baseUnit'])
            ->whereIn('status', ['aprobada', 'en_proceso'])
            ->whereIn('warehouse_id', $this->warehouseIds($f, $user))
            ->when($f['priority'] ?? null, fn ($q, $p) => $q->where('priority', $p))
            ->orderBy('required_date')->get();

        $rows = [];
        foreach ($requests as $request) {
            foreach ($request->items as $item) {
                $pending = max(0, (float) $item->qty_base - (float) $item->qty_shipped_base);
                if ($pending <= 0) {
                    continue;
                }
                $rows[] = [
                    'solicitud' => $request->number,
                    'fecha_requerida' => $request->required_date?->format('Y-m-d') ?? '—',
                    'bodega' => $request->warehouse->code,
                    'prioridad' => ucfirst($request->priority),
                    'solicitante' => $request->requester?->name ?? '—',
                    'producto' => "{$item->product->sku} · {$item->product->name}",
                    'pedido' => (float) $item->qty_base,
                    'ordenado' => (float) $item->qty_ordered_base,
                    'despachado' => (float) $item->qty_shipped_base,
                    'pendiente' => $pending,
                    'unidad' => $item->product->baseUnit->code,
                ];
            }
        }

        return [
            'columns' => [
                ['key' => 'solicitud', 'label' => 'Solicitud', 'type' => 'text'],
                ['key' => 'fecha_requerida', 'label' => 'Requerida', 'type' => 'text'],
                ['key' => 'bodega', 'label' => 'Bodega', 'type' => 'text'],
                ['key' => 'prioridad', 'label' => 'Prioridad', 'type' => 'text'],
                ['key' => 'solicitante', 'label' => 'Solicitante', 'type' => 'text'],
                ['key' => 'producto', 'label' => 'Producto', 'type' => 'text'],
                ['key' => 'pedido', 'label' => 'Pedido', 'type' => 'qty'],
                ['key' => 'ordenado', 'label' => 'Ordenado', 'type' => 'qty'],
                ['key' => 'despachado', 'label' => 'Despachado', 'type' => 'qty'],
                ['key' => 'pendiente', 'label' => 'Pendiente', 'type' => 'qty'],
                ['key' => 'unidad', 'label' => 'Unidad', 'type' => 'text'],
            ],
            'rows' => $rows,
            'totals' => [],
        ];
    }

    /** Catálogo serializable para el frontend (incluye tipos de movimiento para el filtro del kardex). */
    public function catalog(): array
    {
        $reports = [];
        foreach (self::CATALOG as $key => $def) {
            $reports[] = ['key' => $key] + $def;
        }

        return [
            'reports' => $reports,
            'movement_types' => collect(StockMovementType::cases())
                ->map(fn ($t) => ['value' => $t->value, 'label' => $t->label()])->values()->all(),
            'loan_statuses' => collect(LoanStatus::cases())
                ->map(fn ($s) => ['value' => $s->value, 'label' => $s->label()])->values()->all(),
        ];
    }
}
