<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Enums\PurchaseRequestStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Purchasing\PurchaseRequestResource;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Services\Purchasing\PurchaseRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class PurchaseRequestController extends Controller
{
    private const DETAIL = [
        'warehouse', 'requester', 'approver', 'creator',
        'items.product.baseUnit', 'items.unit',
        'approvals.requester', 'approvals.decider', 'attachments.uploader',
    ];

    public function __construct(private readonly PurchaseRequestService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = PurchaseRequest::query()
            ->with(['warehouse', 'requester'])
            ->withCount('items')
            ->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($priority = $request->query('priority')) {
            $query->where('priority', $priority);
        }
        if ($by = $request->query('requested_by')) {
            $query->where('requested_by', $by);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('created_at', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'created_at', 'required_date', 'priority', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');

        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return PurchaseRequestResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    /** Conteo por estado para las pestañas del listado. */
    public function counts(Request $request): JsonResponse
    {
        $rows = PurchaseRequest::query()->visibleTo($request->user())
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, int $id): PurchaseRequestResource
    {
        $pr = PurchaseRequest::query()->visibleTo($request->user())->with(self::DETAIL)->findOrFail($id);

        return new PurchaseRequestResource($pr);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $pr = $this->service->save(null, $data, $request->user());

        return (new PurchaseRequestResource($pr->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): PurchaseRequestResource
    {
        $pr = PurchaseRequest::query()->visibleTo($request->user())->findOrFail($id);
        $data = $request->validate($this->rules());
        $pr = $this->service->save($pr, $data, $request->user());

        return new PurchaseRequestResource($pr->load(self::DETAIL));
    }

    public function submit(Request $request, int $id): PurchaseRequestResource
    {
        return $this->transition($request, $id, fn ($pr) => $this->service->submit($pr, $request->user()));
    }

    public function approve(Request $request, int $id): PurchaseRequestResource
    {
        $data = $request->validate(['comment' => ['nullable', 'string', 'max:500']]);

        return $this->transition($request, $id, fn ($pr) => $this->service->approve($pr, $request->user(), $data['comment'] ?? null));
    }

    public function reject(Request $request, int $id): PurchaseRequestResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return $this->transition($request, $id, fn ($pr) => $this->service->reject($pr, $request->user(), $data['reason']));
    }

    public function cancel(Request $request, int $id): PurchaseRequestResource
    {
        return $this->transition($request, $id, fn ($pr) => $this->service->cancel($pr));
    }

    public function close(Request $request, int $id): PurchaseRequestResource
    {
        return $this->transition($request, $id, fn ($pr) => $this->service->close($pr));
    }

    /**
     * Ítems de solicitudes aprobadas con cantidad pendiente de ordenar
     * (para "Traer ítems de solicitudes" en cotizaciones y OC).
     */
    public function pendingItems(Request $request): JsonResponse
    {
        $items = PurchaseRequestItem::query()
            ->with(['request.warehouse', 'product.baseUnit', 'unit'])
            ->whereHas('request', function ($q) use ($request) {
                $q->whereIn('status', [PurchaseRequestStatus::Aprobada->value, PurchaseRequestStatus::EnProceso->value])
                    ->visibleTo($request->user());
                if ($wh = $request->query('warehouse_id')) {
                    $q->where('warehouse_id', $wh);
                }
                if ($ids = $request->query('request_ids')) {
                    $q->whereIn('id', is_array($ids) ? $ids : explode(',', $ids));
                }
            })
            ->whereColumn('qty_ordered_base', '<', 'qty_base')
            ->when($request->query('product_id'), fn ($q, $pid) => $q->where('product_id', $pid))
            ->get()
            ->map(fn (PurchaseRequestItem $i) => [
                'id' => $i->id,
                'request' => [
                    'id' => $i->request->id,
                    'number' => $i->request->number,
                    'priority' => $i->request->priority,
                    'required_date' => $i->request->required_date?->format('Y-m-d'),
                    'warehouse' => ['id' => $i->request->warehouse->id, 'code' => $i->request->warehouse->code, 'name' => $i->request->warehouse->name],
                ],
                'product' => ['id' => $i->product->id, 'sku' => $i->product->sku, 'name' => $i->product->name, 'base_unit' => $i->product->baseUnit->code],
                'unit' => ['id' => $i->unit->id, 'code' => $i->unit->code],
                'factor' => (float) $i->factor,
                'quantity' => (float) $i->quantity,
                'qty_base' => (float) $i->qty_base,
                'qty_ordered_base' => (float) $i->qty_ordered_base,
                'pending_base' => $i->pendingToOrderBase(),
                'notes' => $i->notes,
            ])->values();

        return response()->json(['data' => $items]);
    }

    private function transition(Request $request, int $id, callable $fn): PurchaseRequestResource
    {
        $pr = PurchaseRequest::query()->visibleTo($request->user())->findOrFail($id);
        $pr = $fn($pr);

        return new PurchaseRequestResource($pr->fresh(self::DETAIL));
    }

    private function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'requested_by' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'required_date' => ['nullable', 'date'],
            'priority' => ['required', Rule::in(['baja', 'normal', 'alta', 'urgente'])],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.unit_id' => ['required', 'integer', Rule::exists('units', 'id')],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
