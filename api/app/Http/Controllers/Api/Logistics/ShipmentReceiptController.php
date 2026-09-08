<?php

namespace App\Http\Controllers\Api\Logistics;

use App\Http\Controllers\Controller;
use App\Http\Resources\Logistics\ShipmentReceiptResource;
use App\Models\ShipmentReceipt;
use App\Services\Logistics\ShipmentReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class ShipmentReceiptController extends Controller
{
    private const DETAIL = [
        'shipment.origin', 'shipment.destination', 'shipment.vehicle', 'shipment.driver',
        'receiver', 'creator', 'items.product.baseUnit', 'items.shipmentItem', 'novelties',
        'attachments.uploader',
    ];

    public function __construct(private readonly ShipmentReceiptService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = ShipmentReceipt::query()
            ->with(['shipment.origin', 'shipment.destination', 'receiver'])
            ->withCount('items')
            ->whereHas('shipment', fn ($q) => $q->visibleTo($request->user()));

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($shipmentId = $request->query('shipment_id')) {
            $query->where('shipment_id', $shipmentId);
        }
        if ($destination = $request->query('destination_warehouse_id')) {
            $query->whereHas('shipment', fn ($q) => $q->where('destination_warehouse_id', $destination));
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('shipment', fn ($s) => $s->where('number', 'like', "%{$search}%")));
        }

        $query->orderByDesc('created_at');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return ShipmentReceiptResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(Request $request, int $id): ShipmentReceiptResource
    {
        return new ShipmentReceiptResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $receipt = $this->service->save(null, $data, $request->user());

        return (new ShipmentReceiptResource($receipt->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): ShipmentReceiptResource
    {
        $receipt = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new ShipmentReceiptResource($this->service->save($receipt, $data, $request->user())->load(self::DETAIL));
    }

    public function confirm(Request $request, int $id): ShipmentReceiptResource
    {
        $receipt = $this->service->confirm($this->find($request, $id), $request->user());

        return new ShipmentReceiptResource($receipt->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): ShipmentReceiptResource
    {
        $receipt = $this->service->cancel($this->find($request, $id), $request->user());

        return new ShipmentReceiptResource($receipt->fresh(self::DETAIL));
    }

    private function find(Request $request, int $id): ShipmentReceipt
    {
        return ShipmentReceipt::query()
            ->whereHas('shipment', fn ($q) => $q->visibleTo($request->user()))
            ->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'shipment_id' => ['required', 'integer', Rule::exists('shipments', 'id')],
            'received_at' => ['required', 'date'],
            'received_by' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.shipment_item_id' => ['required', 'integer', Rule::exists('shipment_items', 'id')],
            'items.*.qty_received_base' => ['required', 'numeric', 'min:0'],
            'items.*.qty_damaged_base' => ['nullable', 'numeric', 'min:0'],
            'items.*.qty_extra_base' => ['nullable', 'numeric', 'min:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
