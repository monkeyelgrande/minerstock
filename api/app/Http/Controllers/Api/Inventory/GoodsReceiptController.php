<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\Inventory\GoodsReceiptResource;
use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use App\Services\Inventory\GoodsReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class GoodsReceiptController extends Controller
{
    private const DETAIL = [
        'order.supplier', 'warehouse', 'receiver', 'creator',
        'items.product.baseUnit', 'items.unit', 'items.orderItem', 'returns', 'attachments.uploader',
    ];

    public function __construct(private readonly GoodsReceiptService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = GoodsReceipt::query()->with(['order.supplier', 'warehouse', 'receiver'])->withCount('items')->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($po = $request->query('purchase_order_id')) {
            $query->where('purchase_order_id', $po);
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->whereHas('order', fn ($q) => $q->where('supplier_id', $supplier));
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('received_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('received_at', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhere('supplier_remission', 'like', "%{$search}%")
                ->orWhereHas('order', fn ($o) => $o->where('number', 'like', "%{$search}%")->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%"))));
        }

        $sort = in_array($request->query('sort'), ['number', 'received_at', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return GoodsReceiptResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function counts(Request $request): JsonResponse
    {
        return response()->json(['data' => GoodsReceipt::query()->visibleTo($request->user())
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status')]);
    }

    public function show(Request $request, int $id): GoodsReceiptResource
    {
        return new GoodsReceiptResource($this->find($request, $id)->load(self::DETAIL));
    }

    /** Órdenes que admiten recepción (emitidas / recibidas parcial) con sus ítems pendientes. */
    public function receivableOrders(Request $request): JsonResponse
    {
        $orders = PurchaseOrder::query()->visibleTo($request->user())
            ->whereIn('status', ['emitida', 'recibida_parcial'])
            ->with(['supplier', 'warehouse', 'items.product.baseUnit', 'items.product.units.unit', 'items.unit'])
            ->when($request->query('supplier_id'), fn ($q, $s) => $q->where('supplier_id', $s))
            ->when($request->query('id'), fn ($q, $id) => $q->where('id', $id))
            ->orderByDesc('issued_at')->get()
            ->map(fn (PurchaseOrder $po) => [
                'id' => $po->id,
                'number' => $po->number,
                'status' => $po->status->value,
                'status_label' => $po->status->label(),
                'date' => $po->date?->format('Y-m-d'),
                'expected_date' => $po->expected_date?->format('Y-m-d'),
                'supplier' => ['id' => $po->supplier->id, 'name' => $po->supplier->name],
                'warehouse' => ['id' => $po->warehouse->id, 'code' => $po->warehouse->code, 'name' => $po->warehouse->name],
                'items' => $po->items->map(fn ($i) => [
                    'id' => $i->id,
                    'product' => ['id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name, 'base_unit' => $i->product->baseUnit->code, 'base_unit_id' => $i->product->base_unit_id],
                    'units' => collect([['id' => $i->product->base_unit_id, 'code' => $i->product->baseUnit->code, 'factor' => 1.0]])
                        ->concat($i->product->units->map(fn ($u) => ['id' => $u->unit_id, 'code' => $u->unit->code, 'factor' => (float) $u->factor]))->values(),
                    'unit' => ['id' => $i->unit->id, 'code' => $i->unit->code],
                    'factor' => (float) $i->factor,
                    'quantity' => (float) $i->quantity,
                    'qty_base' => (float) $i->qty_base,
                    'qty_received_base' => (float) $i->qty_received_base,
                    'pending_base' => $i->pendingToReceiveBase(),
                    'unit_price' => (float) $i->unit_price,
                    'base_unit_cost' => $i->baseUnitCost(),
                ])->filter(fn ($i) => $i['pending_base'] > 0)->values(),
            ])->filter(fn ($po) => $po['items']->isNotEmpty())->values();

        return response()->json(['data' => $orders]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $receipt = $this->service->save(null, $data, $request->user());

        return (new GoodsReceiptResource($receipt->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): GoodsReceiptResource
    {
        $receipt = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new GoodsReceiptResource($this->service->save($receipt, $data, $request->user())->load(self::DETAIL));
    }

    public function confirm(Request $request, int $id): GoodsReceiptResource
    {
        $receipt = $this->service->confirm($this->find($request, $id), $request->user());

        return new GoodsReceiptResource($receipt->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): GoodsReceiptResource
    {
        $receipt = $this->service->cancel($this->find($request, $id), $request->user());

        return new GoodsReceiptResource($receipt->fresh(self::DETAIL));
    }

    private function find(Request $request, int $id): GoodsReceipt
    {
        return GoodsReceipt::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'purchase_order_id' => ['required', 'integer', Rule::exists('purchase_orders', 'id')],
            'warehouse_id' => ['nullable', 'integer', Rule::exists('warehouses', 'id')],
            'supplier_remission' => ['nullable', 'string', 'max:60'],
            'received_at' => ['required', 'date'],
            'received_by' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.purchase_order_item_id' => ['required', 'integer', Rule::exists('purchase_order_items', 'id')],
            'items.*.unit_id' => ['nullable', 'integer', Rule::exists('units', 'id')],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
