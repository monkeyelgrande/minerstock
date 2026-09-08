<?php

namespace App\Http\Controllers\Api\Logistics;

use App\Exceptions\DomainException;
use App\Http\Controllers\Controller;
use App\Models\ShipmentNovelty;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Novedades de transporte (faltantes, dañados, sobrantes) y su resolución. */
class NoveltyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ShipmentNovelty::query()
            ->with([
                'receiptItem.product.baseUnit',
                'receiptItem.receipt.shipment.origin',
                'receiptItem.receipt.shipment.destination',
                'receiptItem.receipt.shipment.driver',
                'resolver',
            ])
            ->whereHas('receiptItem.receipt', fn ($q) => $q->where('status', 'confirmado')
                ->whereHas('shipment', fn ($s) => $s->visibleTo($request->user())));

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        if ($destination = $request->query('destination_warehouse_id')) {
            $query->whereHas('receiptItem.receipt.shipment', fn ($q) => $q->where('destination_warehouse_id', $destination));
        }

        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);
        $page = $query->orderByRaw("case when status = 'abierta' then 0 else 1 end")->orderByDesc('id')->paginate($perPage);

        $page->getCollection()->transform(function (ShipmentNovelty $n) {
            $receipt = $n->receiptItem?->receipt;
            $shipment = $receipt?->shipment;

            return [
                'id' => $n->id,
                'type' => $n->type,
                'type_label' => ShipmentNovelty::TYPES[$n->type] ?? $n->type,
                'qty_base' => (float) $n->qty_base,
                'description' => $n->description,
                'status' => $n->status,
                'resolution' => $n->resolution,
                'resolver' => $n->resolver ? ['id' => $n->resolver->id, 'name' => $n->resolver->name] : null,
                'resolved_at' => $n->resolved_at,
                'product' => $n->receiptItem?->product ? [
                    'id' => $n->receiptItem->product->id,
                    'sku' => $n->receiptItem->product->sku,
                    'name' => $n->receiptItem->product->name,
                    'base_unit' => $n->receiptItem->product->baseUnit?->code,
                ] : null,
                'receipt' => $receipt ? ['id' => $receipt->id, 'number' => $receipt->number, 'received_at' => $receipt->received_at?->format('Y-m-d')] : null,
                'shipment' => $shipment ? [
                    'id' => $shipment->id,
                    'number' => $shipment->number,
                    'origin' => $shipment->origin?->name,
                    'destination' => $shipment->destination?->name,
                    'driver' => $shipment->driver?->name,
                ] : null,
                'created_at' => $n->created_at,
            ];
        });

        return response()->json($page->toArray() + ['open_count' => ShipmentNovelty::query()->where('status', 'abierta')->count()]);
    }

    public function counts(Request $request): JsonResponse
    {
        return response()->json(['data' => ShipmentNovelty::query()
            ->whereHas('receiptItem.receipt', fn ($q) => $q->where('status', 'confirmado')
                ->whereHas('shipment', fn ($s) => $s->visibleTo($request->user())))
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')]);
    }

    public function resolve(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['resolution' => ['required', 'string', 'max:1000']]);
        $novelty = ShipmentNovelty::query()->findOrFail($id);
        if ($novelty->status === 'resuelta') {
            throw new DomainException('La novedad ya está resuelta.');
        }
        $novelty->forceFill([
            'status' => 'resuelta',
            'resolution' => $data['resolution'],
            'resolved_by' => $request->user()->id,
            'resolved_at' => now(),
        ])->save();

        return response()->json(['message' => 'Novedad resuelta.']);
    }
}
