<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Adjustment;
use App\Models\GoodsReceipt;
use App\Models\Issue;
use App\Models\Loan;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Quotation;
use App\Models\Shipment;
use App\Models\ShipmentReceipt;
use App\Models\StockCount;
use App\Models\SupplierCreditNote;
use App\Models\SupplierInvoice;
use App\Models\SupplierReturn;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Buscador global del topbar: documentos por número y productos por nombre o SKU. */
class SearchController extends Controller
{
    /** tipo → [modelo, permiso, ruta base, etiqueta, usa visibleTo]. */
    private const TYPES = [
        'purchase_request' => [PurchaseRequest::class, 'purchase_requests.view', '/compras/solicitudes', 'Solicitudes', true],
        'quotation' => [Quotation::class, 'quotations.view', '/compras/cotizaciones', 'Cotizaciones', false],
        'purchase_order' => [PurchaseOrder::class, 'purchase_orders.view', '/compras/ordenes', 'Órdenes de compra', true],
        'goods_receipt' => [GoodsReceipt::class, 'goods_receipts.view', '/inventario/recepciones', 'Recepciones de compra', true],
        'supplier_return' => [SupplierReturn::class, 'supplier_returns.view', '/inventario/devoluciones', 'Devoluciones', true],
        'adjustment' => [Adjustment::class, 'adjustments.view', '/inventario/ajustes', 'Ajustes', true],
        'stock_count' => [StockCount::class, 'stock_counts.view', '/inventario/conteos', 'Conteos', true],
        'supplier_invoice' => [SupplierInvoice::class, 'supplier_invoices.view', '/pagos/facturas', 'Facturas', false],
        'supplier_credit_note' => [SupplierCreditNote::class, 'supplier_credit_notes.view', '/pagos/notas-credito', 'Notas crédito', false],
        'shipment' => [Shipment::class, 'shipments.view', '/logistica/planillas', 'Planillas', true],
        'shipment_receipt' => [ShipmentReceipt::class, 'shipment_receipts.view', '/logistica/recepcion', 'Recepciones en mina', false],
        'issue' => [Issue::class, 'issues.view', '/bodega/vales', 'Vales de salida', true],
        'loan' => [Loan::class, 'loans.view', '/bodega/prestamos', 'Préstamos', true],
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['data' => []]);
        }

        /** @var User $user */
        $user = $request->user();
        $groups = [];

        foreach (self::TYPES as $type => [$model, $permission, $route, $label, $scoped]) {
            if (! $user->can($permission)) {
                continue;
            }
            $query = $model::query()->where('number', 'like', "%{$q}%");
            if ($scoped) {
                $query->visibleTo($user);
            }
            $items = $query->orderByDesc('id')->limit(5)->get()
                ->map(fn ($doc) => [
                    'id' => $doc->id,
                    'title' => $doc->number,
                    'subtitle' => $this->subtitle($doc),
                    'route' => "{$route}/{$doc->id}",
                ])->values();

            if ($items->isNotEmpty()) {
                $groups[] = ['type' => $type, 'label' => $label, 'items' => $items];
            }
        }

        if ($user->can('products.view')) {
            $products = Product::query()
                ->with('baseUnit')
                ->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('sku', 'like', "%{$q}%"))
                ->where('is_active', true)
                ->orderBy('name')->limit(5)->get()
                ->map(fn (Product $p) => [
                    'id' => $p->id,
                    'title' => $p->name,
                    'subtitle' => "{$p->sku} · {$p->baseUnit->code}",
                    'route' => '/catalogo/productos',
                    'params' => ['search' => $p->sku],
                ])->values();

            if ($products->isNotEmpty()) {
                $groups[] = ['type' => 'product', 'label' => 'Productos', 'items' => $products];
            }
        }

        return response()->json(['data' => $groups]);
    }

    private function subtitle(object $doc): string
    {
        $status = $doc->status;
        $label = is_object($status) && method_exists($status, 'label') ? $status->label() : (string) $status;
        $extra = $doc->supplier->name ?? $doc->recipient->name ?? $doc->warehouse->name ?? null;

        return $extra ? "{$label} · {$extra}" : $label;
    }
}
