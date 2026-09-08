<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Quotation;
use App\Models\Shipment;
use App\Models\ShipmentNovelty;
use App\Models\StockCount;
use App\Models\SupplierCreditNote;
use App\Models\SupplierInvoice;
use App\Services\Inventory\StockQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Resumen para el dashboard. Cada bloque se incluye solo si el usuario tiene permiso de verlo. */
class DashboardController extends Controller
{
    public function __construct(private readonly StockQueryService $stock) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = [];

        if ($user->can('purchase_requests.view')) {
            $counts = PurchaseRequest::query()->visibleTo($user)
                ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
            $data['purchase_requests'] = [
                'enviada' => (int) ($counts['enviada'] ?? 0),
                'aprobada' => (int) ($counts['aprobada'] ?? 0),
                'en_proceso' => (int) ($counts['en_proceso'] ?? 0),
                'rechazada' => (int) ($counts['rechazada'] ?? 0),
            ];
        }

        if ($user->can('purchase_orders.view')) {
            $counts = PurchaseOrder::query()->visibleTo($user)
                ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
            $data['purchase_orders'] = [
                'pendiente_aprobacion' => (int) ($counts['pendiente_aprobacion'] ?? 0),
                'aprobada' => (int) ($counts['aprobada'] ?? 0),
                'emitida' => (int) ($counts['emitida'] ?? 0),
                'recibida_parcial' => (int) ($counts['recibida_parcial'] ?? 0),
                'month_total' => (float) PurchaseOrder::query()->visibleTo($user)
                    ->whereIn('status', ['aprobada', 'emitida', 'recibida_parcial', 'recibida', 'cerrada'])
                    ->whereMonth('date', now()->month)->whereYear('date', now()->year)->sum('total'),
            ];
            $data['recent_orders'] = PurchaseOrder::query()->visibleTo($user)
                ->with(['supplier', 'items'])->latest('id')->limit(6)->get()
                ->map(fn (PurchaseOrder $po) => [
                    'id' => $po->id,
                    'number' => $po->number,
                    'supplier' => $po->supplier->name,
                    'date' => $po->date?->format('Y-m-d'),
                    'total' => (float) $po->total,
                    'status' => $po->status->value,
                    'status_label' => $po->status->label(),
                    'received_pct' => $this->receivedPct($po),
                ])->values();
        }

        if ($user->can('quotations.view')) {
            $data['quotations'] = [
                'expiring' => Quotation::query()->whereIn('status', ['recibida'])
                    ->whereNotNull('valid_until')->whereBetween('valid_until', [today(), today()->addDays(7)])->count(),
                'received' => Quotation::query()->where('status', 'recibida')->count(),
            ];
        }

        if ($user->can('approvals.view')) {
            $data['approvals_pending'] = [
                'purchase_requests' => PurchaseRequest::query()->where('status', 'enviada')->count(),
                'purchase_orders' => PurchaseOrder::query()->where('status', 'pendiente_aprobacion')->count(),
            ];
        }

        if ($user->can('shipments.view')) {
            $inTransit = Shipment::query()->visibleTo($user)->whereIn('status', ['despachada', 'recibida_parcial'])
                ->with('items')->get();
            $data['logistics'] = [
                'in_transit_count' => $inTransit->count(),
                'in_transit_value' => round((float) $inTransit->sum(fn ($s) => $s->items->sum(fn ($i) => $i->pendingBase() * (float) $i->unit_cost)), 2),
                'open_novelties' => $user->can('novelties.view')
                    ? ShipmentNovelty::query()->where('status', 'abierta')
                        ->whereHas('receiptItem.receipt', fn ($q) => $q->where('status', 'confirmado')->whereHas('shipment', fn ($s) => $s->visibleTo($user)))
                        ->count()
                    : 0,
                'draft_shipments' => Shipment::query()->visibleTo($user)->where('status', 'borrador')->count(),
            ];
        }

        if ($user->can('supplier_invoices.view')) {
            $open = SupplierInvoice::query()->whereIn('status', ['pendiente', 'parcial'])->get(['total', 'paid_amount', 'credited_amount', 'due_date', 'status']);
            $data['payables'] = [
                'open_count' => $open->count(),
                'open_balance' => round((float) $open->sum(fn ($i) => $i->balance()), 2),
                'overdue_count' => $open->filter(fn ($i) => $i->isOverdue())->count(),
                'overdue_balance' => round((float) $open->filter(fn ($i) => $i->isOverdue())->sum(fn ($i) => $i->balance()), 2),
                'due_soon_balance' => round((float) $open->filter(fn ($i) => ! $i->isOverdue() && $i->due_date !== null && $i->due_date->lte(today()->addDays(7)))->sum(fn ($i) => $i->balance()), 2),
                'available_credit' => round((float) SupplierCreditNote::query()->where('status', 'disponible')->get(['amount', 'applied_amount'])->sum(fn ($n) => $n->availableAmount()), 2),
            ];
        }

        if ($user->can('stock.view')) {
            $whIds = $this->stock->warehousesFor($user)->pluck('id')->all();
            $totals = $this->stock->totals($whIds);
            $data['stock'] = $totals + [
                'receipts_draft' => $user->can('goods_receipts.view') ? GoodsReceipt::query()->visibleTo($user)->where('status', 'borrador')->count() : 0,
                'counts_open' => $user->can('stock_counts.view') ? StockCount::query()->visibleTo($user)->where('status', 'en_proceso')->count() : 0,
            ];
        }

        return response()->json(['data' => $data]);
    }

    private function receivedPct(PurchaseOrder $po): int
    {
        $total = (float) $po->items->sum('qty_base');

        return $total > 0 ? (int) round(min(100, (float) $po->items->sum('qty_received_base') / $total * 100)) : 0;
    }
}
