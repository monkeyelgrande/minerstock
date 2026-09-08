<?php

namespace App\Services\Inventory;

use App\Models\Product;
use App\Models\StockBalance;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseProduct;
use App\Services\Logistics\ShipmentService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/** Consultas de stock: saldos por bodega, matriz por producto y kardex. */
class StockQueryService
{
    public function __construct(private readonly ShipmentService $shipments) {}

    /** Bodegas visibles por el usuario. */
    public function warehousesFor(User $user): Collection
    {
        $q = Warehouse::query()->where('is_active', true)->with('site')->orderBy('name');
        if (! $user->seesAllWarehouses()) {
            $q->whereIn('id', $user->warehouses()->pluck('warehouses.id'));
        }

        return $q->get();
    }

    /**
     * Matriz producto × bodega. Filtros: warehouse_id, category_id, search, below_min, kind.
     *
     * @return array{warehouses: array, rows: LengthAwarePaginator, totals: array}
     */
    public function matrix(User $user, array $filters, int $perPage = 25): array
    {
        $warehouses = $this->warehousesFor($user);
        if (! empty($filters['warehouse_id'])) {
            $warehouses = $warehouses->where('id', (int) $filters['warehouse_id'])->values();
        }
        $whIds = $warehouses->pluck('id')->all();

        $products = Product::query()->with(['baseUnit', 'category', 'warehouseSettings'])
            ->where('is_active', true)
            ->whereHas('stockBalances', fn (Builder $b) => $b->whereIn('warehouse_id', $whIds))
            ->when($filters['category_id'] ?? null, fn ($q, $c) => $q->where('category_id', $c))
            ->when($filters['kind'] ?? null, fn ($q, $k) => $q->where('kind', $k))
            ->when(trim((string) ($filters['search'] ?? '')), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('sku', 'like', "%{$s}%")))
            ->orderBy('name');

        // Filtro "bajo mínimo" se evalúa en PHP sobre la página (mínimos varían por bodega).
        $belowMin = ! empty($filters['below_min']);
        $page = $belowMin ? $products->get() : $products->paginate($perPage);
        $list = $belowMin ? $page : $page->getCollection();

        $balances = StockBalance::query()->whereIn('warehouse_id', $whIds)
            ->whereIn('product_id', $list->pluck('id'))->get()
            ->groupBy('product_id');
        $inTransit = $this->shipments->inTransitByProduct($filters['warehouse_id'] ?? null ? (int) $filters['warehouse_id'] : null);

        $rows = $list->map(function (Product $p) use ($warehouses, $balances, $inTransit) {
            $byWh = ($balances[$p->id] ?? collect())->keyBy('warehouse_id');
            $settings = $p->warehouseSettings->keyBy('warehouse_id');
            $cells = [];
            $totalQty = 0.0;
            $totalValue = 0.0;
            $anyBelow = false;
            foreach ($warehouses as $wh) {
                $b = $byWh->get($wh->id);
                $qty = $b ? (float) $b->qty : 0.0;
                $avg = $b ? (float) $b->avg_cost : 0.0;
                $min = $settings->has($wh->id) ? (float) $settings[$wh->id]->min_stock : (float) $p->default_min_stock;
                $below = $min > 0 && $qty < $min;
                $anyBelow = $anyBelow || $below;
                $totalQty += $qty;
                $totalValue += $qty * $avg;
                $cells[] = ['warehouse_id' => $wh->id, 'qty' => $qty, 'avg_cost' => $avg, 'value' => round($qty * $avg, 2), 'min_stock' => $min, 'below_min' => $below];
            }

            return [
                'product' => ['id' => $p->id, 'sku' => $p->sku, 'name' => $p->name, 'kind' => $p->kind, 'base_unit' => $p->baseUnit->code, 'category' => $p->category?->name],
                'cells' => $cells,
                'total_qty' => round($totalQty, 3),
                'total_value' => round($totalValue, 2),
                'avg_cost' => $totalQty > 0 ? round($totalValue / $totalQty, 4) : 0,
                'below_min' => $anyBelow,
                'in_transit' => round((float) ($inTransit[$p->id]['qty'] ?? 0), 3),
                'on_loan' => 0.0,      // fase 5
            ];
        });

        if ($belowMin) {
            $rows = $rows->filter(fn ($r) => $r['below_min'])->values();
            $page = new \Illuminate\Pagination\LengthAwarePaginator($rows->forPage(1, 1000)->values(), $rows->count(), 1000, 1);
        } else {
            $page->setCollection($rows);
        }

        return [
            'warehouses' => $warehouses->map(fn ($w) => ['id' => $w->id, 'code' => $w->code, 'name' => $w->name, 'site' => $w->site?->name])->values()->all(),
            'rows' => $page,
            'totals' => $this->totals($whIds),
        ];
    }

    /** Totales de inventario para KPIs. */
    public function totals(array $warehouseIds): array
    {
        $balances = StockBalance::query()->whereIn('warehouse_id', $warehouseIds)->where('qty', '>', 0)->get();
        $value = round((float) $balances->sum(fn ($b) => (float) $b->qty * (float) $b->avg_cost), 2);

        $belowMin = 0;
        $products = Product::query()->whereIn('id', $balances->pluck('product_id')->unique())->with('warehouseSettings')->get()->keyBy('id');
        foreach ($balances as $b) {
            $p = $products[$b->product_id] ?? null;
            if (! $p) {
                continue;
            }
            $setting = $p->warehouseSettings->firstWhere('warehouse_id', $b->warehouse_id);
            $min = $setting ? (float) $setting->min_stock : (float) $p->default_min_stock;
            if ($min > 0 && (float) $b->qty < $min) {
                $belowMin++;
            }
        }

        $inTransit = $this->shipments->inTransitByProduct();

        return [
            'total_value' => $value,
            'products_with_stock' => $balances->pluck('product_id')->unique()->count(),
            'below_min' => $belowMin,
            'in_transit_value' => round((float) array_sum(array_column($inTransit, 'value')), 2),
            'on_loan_count' => 0,
        ];
    }

    /** Kardex paginado. Filtros: warehouse_id, product_id (obligatorios para saldo corrido), type, date_from, date_to. */
    public function kardex(User $user, array $filters, int $perPage = 50): LengthAwarePaginator
    {
        $whIds = $this->warehousesFor($user)->pluck('id')->all();

        return StockMovement::query()
            ->with(['warehouse', 'product.baseUnit', 'user', 'source'])
            ->whereIn('warehouse_id', $whIds)
            ->when($filters['warehouse_id'] ?? null, fn ($q, $w) => $q->where('warehouse_id', $w))
            ->when($filters['product_id'] ?? null, fn ($q, $p) => $q->where('product_id', $p))
            ->when($filters['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($filters['date_from'] ?? null, fn ($q, $d) => $q->whereDate('moved_at', '>=', $d))
            ->when($filters['date_to'] ?? null, fn ($q, $d) => $q->whereDate('moved_at', '<=', $d))
            ->orderByDesc('moved_at')->orderByDesc('id')
            ->paginate($perPage);
    }

    /** Saldo de un producto en cada bodega visible (para selectores en documentos). */
    public function productBalances(User $user, int $productId): Collection
    {
        $whIds = $this->warehousesFor($user)->pluck('id')->all();

        return StockBalance::query()->with('warehouse')->where('product_id', $productId)->whereIn('warehouse_id', $whIds)->get()
            ->map(fn (StockBalance $b) => ['warehouse_id' => $b->warehouse_id, 'warehouse' => $b->warehouse->name, 'qty' => (float) $b->qty, 'avg_cost' => (float) $b->avg_cost]);
    }

    public function minStockFor(Product $product, int $warehouseId): float
    {
        $s = WarehouseProduct::query()->where('product_id', $product->id)->where('warehouse_id', $warehouseId)->first();

        return $s ? (float) $s->min_stock : (float) $product->default_min_stock;
    }
}
