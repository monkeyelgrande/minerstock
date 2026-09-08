<?php

namespace App\Http\Controllers\Api\Logistics;

use App\Enums\PurchaseRequestStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Logistics\ShipmentResource;
use App\Models\PurchaseRequestItem;
use App\Models\Setting;
use App\Models\Shipment;
use App\Models\StockBalance;
use App\Services\Logistics\ShipmentService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class ShipmentController extends Controller
{
    private const DETAIL = [
        'origin', 'destination', 'vehicle', 'driver', 'dispatcher', 'creator',
        'items.product.baseUnit', 'items.unit', 'items.requestItem.request',
        'receipts', 'attachments.uploader',
    ];

    public function __construct(private readonly ShipmentService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = Shipment::query()
            ->with(['origin', 'destination', 'vehicle', 'driver', 'items'])
            ->withCount('items')
            ->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($origin = $request->query('origin_warehouse_id')) {
            $query->where('origin_warehouse_id', $origin);
        }
        if ($destination = $request->query('destination_warehouse_id')) {
            $query->where('destination_warehouse_id', $destination);
        }
        if ($vehicle = $request->query('vehicle_id')) {
            $query->where('vehicle_id', $vehicle);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('created_at', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('driver', fn ($d) => $d->where('name', 'like', "%{$search}%"))
                ->orWhereHas('vehicle', fn ($v) => $v->where('plate', 'like', "%{$search}%"))
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'dispatched_at', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return ShipmentResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function counts(Request $request): JsonResponse
    {
        return response()->json(['data' => Shipment::query()->visibleTo($request->user())
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')]);
    }

    public function show(Request $request, int $id): ShipmentResource
    {
        return new ShipmentResource($this->find($request, $id)->load(self::DETAIL));
    }

    /**
     * Ítems de solicitudes aprobadas de la bodega destino con cantidad pendiente de
     * despachar, junto con el stock disponible en la bodega origen.
     */
    public function pendingRequestItems(Request $request): JsonResponse
    {
        $data = $request->validate([
            'destination_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'origin_warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')],
        ]);

        $items = PurchaseRequestItem::query()
            ->with(['request', 'product.baseUnit', 'unit'])
            ->whereHas('request', fn ($q) => $q
                ->whereIn('status', [PurchaseRequestStatus::Aprobada->value, PurchaseRequestStatus::EnProceso->value])
                ->where('warehouse_id', $data['destination_warehouse_id']))
            ->whereColumn('qty_shipped_base', '<', 'qty_base')
            ->get();

        $stock = isset($data['origin_warehouse_id'])
            ? StockBalance::query()->where('warehouse_id', $data['origin_warehouse_id'])
                ->whereIn('product_id', $items->pluck('product_id'))->pluck('qty', 'product_id')
            : collect();

        return response()->json(['data' => $items->map(fn (PurchaseRequestItem $i) => [
            'id' => $i->id,
            'request' => ['id' => $i->request->id, 'number' => $i->request->number, 'priority' => $i->request->priority, 'required_date' => $i->request->required_date?->format('Y-m-d')],
            'product' => ['id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name, 'base_unit' => $i->product->baseUnit->code],
            'unit' => ['id' => $i->unit->id, 'code' => $i->unit->code],
            'factor' => (float) $i->factor,
            'qty_base' => (float) $i->qty_base,
            'qty_shipped_base' => (float) $i->qty_shipped_base,
            'pending_base' => round(max(0, (float) $i->qty_base - (float) $i->qty_shipped_base), 3),
            'origin_stock' => (float) ($stock[$i->product_id] ?? 0),
            'notes' => $i->notes,
        ])->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $shipment = $this->service->save(null, $data, $request->user());

        return (new ShipmentResource($shipment->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): ShipmentResource
    {
        $shipment = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new ShipmentResource($this->service->save($shipment, $data, $request->user())->load(self::DETAIL));
    }

    public function dispatch(Request $request, int $id): ShipmentResource
    {
        $shipment = $this->service->dispatch($this->find($request, $id), $request->user());

        return new ShipmentResource($shipment->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): ShipmentResource
    {
        $shipment = $this->service->cancel($this->find($request, $id), $request->user());

        return new ShipmentResource($shipment->fresh(self::DETAIL));
    }

    public function close(Request $request, int $id): ShipmentResource
    {
        $shipment = $this->service->close($this->find($request, $id));

        return new ShipmentResource($shipment->fresh(self::DETAIL));
    }

    /** PDF de la planilla: es el papel que viaja con el chofer. */
    public function pdf(Request $request, int $id): Response
    {
        $shipment = $this->find($request, $id)->load([
            'origin.site', 'destination.site', 'vehicle', 'driver', 'dispatcher', 'creator',
            'items.product.baseUnit', 'items.unit', 'items.requestItem.request',
        ]);

        $pdf = Pdf::loadView('pdf.shipment', [
            'shipment' => $shipment,
            'company' => Setting::get('company', ['name' => config('app.name')]),
        ])->setPaper('letter');

        return $pdf->stream("{$shipment->number}.pdf");
    }

    /** Mercancía en camino, agrupada por planilla. */
    public function inTransit(Request $request): JsonResponse
    {
        $shipments = Shipment::query()
            ->with(['origin', 'destination', 'vehicle', 'driver', 'items.product.baseUnit'])
            ->visibleTo($request->user())
            ->whereIn('status', ['despachada', 'recibida_parcial'])
            ->when($request->query('destination_warehouse_id'), fn ($q, $d) => $q->where('destination_warehouse_id', $d))
            ->orderBy('dispatched_at')
            ->get()
            ->map(fn (Shipment $s) => [
                'id' => $s->id,
                'number' => $s->number,
                'status' => $s->status->value,
                'status_label' => $s->status->label(),
                'origin' => ['id' => $s->origin->id, 'name' => $s->origin->name],
                'destination' => ['id' => $s->destination->id, 'name' => $s->destination->name],
                'vehicle_plate' => $s->vehicle?->plate,
                'driver_name' => $s->driver?->name,
                'dispatched_at' => $s->dispatched_at,
                'days_in_transit' => $s->dispatched_at ? (int) $s->dispatched_at->diffInDays(now()) : null,
                'items' => $s->items->filter(fn ($i) => $i->pendingBase() > 0)->map(fn ($i) => [
                    'product' => ['id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name, 'base_unit' => $i->product->baseUnit->code],
                    'pending_base' => $i->pendingBase(),
                    'value' => round($i->pendingBase() * (float) $i->unit_cost, 2),
                ])->values(),
                'pending_value' => round((float) $s->items->sum(fn ($i) => $i->pendingBase() * (float) $i->unit_cost), 2),
            ])->values();

        return response()->json(['data' => $shipments]);
    }

    private function find(Request $request, int $id): Shipment
    {
        return Shipment::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'origin_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'destination_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id'), 'different:origin_warehouse_id'],
            'vehicle_id' => ['nullable', 'integer', Rule::exists('vehicles', 'id')],
            'driver_id' => ['nullable', 'integer', Rule::exists('drivers', 'id')],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.purchase_request_item_id' => ['nullable', 'integer', Rule::exists('purchase_request_items', 'id')],
            'items.*.unit_id' => ['required', 'integer', Rule::exists('units', 'id')],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
