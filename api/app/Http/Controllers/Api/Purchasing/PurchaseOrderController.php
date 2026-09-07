<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Http\Controllers\Controller;
use App\Http\Resources\Purchasing\PurchaseOrderResource;
use App\Models\PurchaseOrder;
use App\Models\Setting;
use App\Services\Purchasing\PurchaseOrderService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class PurchaseOrderController extends Controller
{
    private const DETAIL = [
        'supplier', 'warehouse', 'approver', 'creator',
        'items.product.baseUnit', 'items.unit', 'items.requestItem.request',
        'approvals.requester', 'approvals.decider', 'attachments.uploader', 'receipts',
    ];

    public function __construct(private readonly PurchaseOrderService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = PurchaseOrder::query()
            ->with(['supplier', 'warehouse', 'items'])
            ->withCount('items')
            ->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->where('supplier_id', $supplier);
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('date', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('date', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%"))
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'date', 'expected_date', 'total', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');

        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return PurchaseOrderResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function counts(Request $request): JsonResponse
    {
        $rows = PurchaseOrder::query()->visibleTo($request->user())
            ->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, int $id): PurchaseOrderResource
    {
        return new PurchaseOrderResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $po = $this->service->save(null, $data, $request->user());

        return (new PurchaseOrderResource($po->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): PurchaseOrderResource
    {
        $po = $this->find($request, $id);
        $data = $request->validate($this->rules());
        $po = $this->service->save($po, $data, $request->user());

        return new PurchaseOrderResource($po->load(self::DETAIL));
    }

    public function submit(Request $request, int $id): PurchaseOrderResource
    {
        return $this->transition($request, $id, fn ($po) => $this->service->submit($po, $request->user()));
    }

    public function approve(Request $request, int $id): PurchaseOrderResource
    {
        $data = $request->validate(['comment' => ['nullable', 'string', 'max:500']]);

        return $this->transition($request, $id, fn ($po) => $this->service->approve($po, $request->user(), $data['comment'] ?? null));
    }

    public function reject(Request $request, int $id): PurchaseOrderResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return $this->transition($request, $id, fn ($po) => $this->service->reject($po, $request->user(), $data['reason']));
    }

    public function reopen(Request $request, int $id): PurchaseOrderResource
    {
        return $this->transition($request, $id, fn ($po) => $this->service->reopen($po));
    }

    public function issue(Request $request, int $id): PurchaseOrderResource
    {
        return $this->transition($request, $id, fn ($po) => $this->service->issue($po));
    }

    public function cancel(Request $request, int $id): PurchaseOrderResource
    {
        return $this->transition($request, $id, fn ($po) => $this->service->cancel($po));
    }

    public function close(Request $request, int $id): PurchaseOrderResource
    {
        return $this->transition($request, $id, fn ($po) => $this->service->close($po));
    }

    /** PDF de la orden para enviar al proveedor (disponible desde aprobada). */
    public function pdf(Request $request, int $id): Response
    {
        $po = $this->find($request, $id)->load(['supplier', 'warehouse.site', 'approver', 'creator', 'items.product.baseUnit', 'items.unit']);

        if ($po->status->isEditable() || $po->status->value === 'pendiente_aprobacion') {
            abort(422, 'El PDF solo está disponible cuando la orden ha sido aprobada.');
        }

        $pdf = Pdf::loadView('pdf.purchase-order', [
            'po' => $po,
            'company' => Setting::get('company', ['name' => config('app.name')]),
        ])->setPaper('letter');

        return $pdf->stream("{$po->number}.pdf");
    }

    private function find(Request $request, int $id): PurchaseOrder
    {
        return PurchaseOrder::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function transition(Request $request, int $id, callable $fn): PurchaseOrderResource
    {
        $po = $fn($this->find($request, $id));

        return new PurchaseOrderResource($po->fresh(self::DETAIL));
    }

    private function rules(): array
    {
        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'date' => ['required', 'date'],
            'expected_date' => ['nullable', 'date'],
            'payment_terms' => ['nullable', Rule::in(['contado', 'credito'])],
            'payment_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.purchase_request_item_id' => ['nullable', 'integer', Rule::exists('purchase_request_items', 'id')],
            'items.*.quotation_item_id' => ['nullable', 'integer', Rule::exists('quotation_items', 'id')],
            'items.*.unit_id' => ['required', 'integer', Rule::exists('units', 'id')],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
