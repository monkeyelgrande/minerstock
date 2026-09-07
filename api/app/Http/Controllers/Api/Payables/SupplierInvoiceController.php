<?php

namespace App\Http\Controllers\Api\Payables;

use App\Enums\SimpleDocStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Payables\SupplierInvoiceResource;
use App\Models\GoodsReceipt;
use App\Models\SupplierInvoice;
use App\Services\Payables\SupplierInvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class SupplierInvoiceController extends Controller
{
    private const DETAIL = [
        'supplier', 'order', 'creator', 'receipts',
        'payments.payment', 'creditApplications.note', 'attachments.uploader',
    ];

    public function __construct(private readonly SupplierInvoiceService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = SupplierInvoice::query()->with(['supplier', 'order']);

        if ($status = $request->query('status')) {
            $statuses = is_array($status) ? $status : explode(',', $status);
            // "vencidas" es un pseudo-estado calculado.
            if (in_array('vencida', $statuses, true)) {
                $query->whereIn('status', ['pendiente', 'parcial'])->whereDate('due_date', '<', today());
            } else {
                $query->whereIn('status', $statuses);
            }
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->where('supplier_id', $supplier);
        }
        if ($order = $request->query('purchase_order_id')) {
            $query->where('purchase_order_id', $order);
        }
        if ($request->boolean('only_open')) {
            $query->whereIn('status', ['pendiente', 'parcial']);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('issue_date', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('issue_date', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhere('supplier_invoice_number', 'like', "%{$search}%")
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'issue_date', 'due_date', 'total', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return SupplierInvoiceResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function counts(): JsonResponse
    {
        $counts = SupplierInvoice::query()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $counts['vencida'] = SupplierInvoice::query()->whereIn('status', ['pendiente', 'parcial'])->whereDate('due_date', '<', today())->count();

        return response()->json(['data' => $counts]);
    }

    public function show(int $id): SupplierInvoiceResource
    {
        return new SupplierInvoiceResource(SupplierInvoice::query()->with(self::DETAIL)->findOrFail($id));
    }

    /** Recepciones confirmadas sin factura, agrupadas por orden, con valores para prellenar. */
    public function invoiceableReceipts(Request $request): JsonResponse
    {
        $receipts = GoodsReceipt::query()
            ->with(['order.supplier', 'warehouse', 'items.orderItem'])
            ->where('status', SimpleDocStatus::Confirmado->value)
            ->whereDoesntHave('invoices')
            ->when($request->query('supplier_id'), fn ($q, $s) => $q->whereHas('order', fn ($o) => $o->where('supplier_id', $s)))
            ->when($request->query('purchase_order_id'), fn ($q, $o) => $q->where('purchase_order_id', $o))
            ->orderByDesc('received_at')->get()
            ->map(function (GoodsReceipt $r) {
                $subtotal = 0.0;
                $tax = 0.0;
                foreach ($r->items as $item) {
                    $line = (float) $item->qty_base * (float) $item->unit_cost_base;
                    $subtotal += $line;
                    $tax += $line * (float) ($item->orderItem?->tax_rate ?? 0) / 100;
                }

                return [
                    'id' => $r->id,
                    'number' => $r->number,
                    'received_at' => $r->received_at?->format('Y-m-d'),
                    'supplier_remission' => $r->supplier_remission,
                    'order' => ['id' => $r->order->id, 'number' => $r->order->number, 'payment_days' => $r->order->payment_days],
                    'supplier' => ['id' => $r->order->supplier->id, 'name' => $r->order->supplier->name],
                    'warehouse' => ['id' => $r->warehouse->id, 'code' => $r->warehouse->code, 'name' => $r->warehouse->name],
                    'items_count' => $r->items->count(),
                    'subtotal' => round($subtotal, 2),
                    'tax' => round($tax, 2),
                ];
            })->values();

        return response()->json(['data' => $receipts]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $invoice = $this->service->save(null, $data, $request->user());

        return (new SupplierInvoiceResource($invoice->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): SupplierInvoiceResource
    {
        $invoice = SupplierInvoice::query()->findOrFail($id);
        $data = $request->validate($this->rules());

        return new SupplierInvoiceResource($this->service->save($invoice, $data, $request->user())->load(self::DETAIL));
    }

    public function cancel(int $id): SupplierInvoiceResource
    {
        $invoice = $this->service->cancel(SupplierInvoice::query()->findOrFail($id));

        return new SupplierInvoiceResource($invoice->fresh(self::DETAIL));
    }

    private function rules(): array
    {
        return [
            'supplier_invoice_number' => ['required', 'string', 'max:60'],
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')],
            'purchase_order_id' => ['nullable', 'integer', Rule::exists('purchase_orders', 'id')],
            'goods_receipt_ids' => ['nullable', 'array'],
            'goods_receipt_ids.*' => ['integer', Rule::exists('goods_receipts', 'id')],
            'issue_date' => ['required', 'date'],
            'due_date' => ['required', 'date', 'after_or_equal:issue_date'],
            'subtotal' => ['required', 'numeric', 'gt:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'withholding' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
