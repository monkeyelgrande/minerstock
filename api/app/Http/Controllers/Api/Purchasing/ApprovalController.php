<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Http\Controllers\Controller;
use App\Models\Approval;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\Json\ResourceCollection;

/** Bandeja de aprobaciones: documentos pendientes de decisión e historial. */
class ApprovalController extends Controller
{
    public function inbox(Request $request): JsonResponse
    {
        $requests = PurchaseRequest::query()->where('status', 'enviada')
            ->with(['warehouse', 'requester', 'items.product'])
            ->orderBy('submitted_at')->get()
            ->map(fn (PurchaseRequest $pr) => [
                'type' => 'purchase_request',
                'id' => $pr->id,
                'number' => $pr->number,
                'title' => 'Solicitud de compra',
                'subtitle' => $pr->warehouse->name,
                'requester' => $pr->requester->name,
                'priority' => $pr->priority,
                'submitted_at' => $pr->submitted_at,
                'items_count' => $pr->items->count(),
                'items_preview' => $pr->items->take(3)->map(fn ($i) => "{$i->product->name} × ".rtrim(rtrim(number_format((float) $i->quantity, 3, '.', ''), '0'), '.'))->values(),
                'total' => null,
                'notes' => $pr->notes,
            ]);

        $orders = PurchaseOrder::query()->where('status', 'pendiente_aprobacion')
            ->with(['supplier', 'warehouse', 'creator', 'items.product'])
            ->orderBy('submitted_at')->get()
            ->map(fn (PurchaseOrder $po) => [
                'type' => 'purchase_order',
                'id' => $po->id,
                'number' => $po->number,
                'title' => 'Orden de compra',
                'subtitle' => $po->supplier->name.' · '.$po->warehouse->name,
                'requester' => $po->creator->name,
                'priority' => null,
                'submitted_at' => $po->submitted_at,
                'items_count' => $po->items->count(),
                'items_preview' => $po->items->take(3)->map(fn ($i) => "{$i->product->name} × ".rtrim(rtrim(number_format((float) $i->quantity, 3, '.', ''), '0'), '.'))->values(),
                'total' => (float) $po->total,
                'notes' => $po->notes,
            ]);

        return response()->json(['data' => [
            'purchase_requests' => $requests->values(),
            'purchase_orders' => $orders->values(),
            'counts' => ['purchase_requests' => $requests->count(), 'purchase_orders' => $orders->count()],
        ]]);
    }

    /** Historial paginado en el formato estándar {data, meta, links}. */
    public function history(Request $request): ResourceCollection
    {
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);
        $page = Approval::query()->whereIn('status', ['aprobada', 'rechazada'])
            ->with(['approvable', 'requester', 'decider'])
            ->orderByDesc('decided_at')
            ->paginate($perPage);

        $page->getCollection()->transform(fn (Approval $a) => [
            'id' => $a->id,
            'type' => $a->approvable instanceof PurchaseOrder ? 'purchase_order' : 'purchase_request',
            'document_id' => $a->approvable_id,
            'number' => $a->approvable?->number,
            'status' => $a->status,
            'requester' => $a->requester?->name,
            'decider' => $a->decider?->name,
            'decided_at' => $a->decided_at,
            'comment' => $a->comment,
        ]);

        return JsonResource::collection($page);
    }
}
