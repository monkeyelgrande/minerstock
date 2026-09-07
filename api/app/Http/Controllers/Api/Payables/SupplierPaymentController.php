<?php

namespace App\Http\Controllers\Api\Payables;

use App\Http\Controllers\Controller;
use App\Http\Resources\Payables\SupplierPaymentResource;
use App\Models\SupplierPayment;
use App\Services\Payables\SupplierPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class SupplierPaymentController extends Controller
{
    private const DETAIL = ['supplier', 'creator', 'allocations.invoice', 'attachments.uploader'];

    public function __construct(private readonly SupplierPaymentService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = SupplierPayment::query()->with(['supplier', 'allocations.invoice']);

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->where('supplier_id', $supplier);
        }
        if ($method = $request->query('method')) {
            $query->where('method', $method);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('date', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('date', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhere('reference', 'like', "%{$search}%")
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'date', 'amount', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return SupplierPaymentResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(int $id): SupplierPaymentResource
    {
        return new SupplierPaymentResource(SupplierPayment::query()->with(self::DETAIL)->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'date' => ['required', 'date'],
            'method' => ['required', Rule::in(array_keys(SupplierPayment::METHODS))],
            'reference' => ['nullable', 'string', 'max:80'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'allocations' => ['required', 'array', 'min:1'],
            'allocations.*.supplier_invoice_id' => ['required', 'integer', Rule::exists('supplier_invoices', 'id')],
            'allocations.*.amount' => ['required', 'numeric', 'min:0'],
        ]);
        $payment = $this->service->create($data, $request->user());

        return (new SupplierPaymentResource($payment->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function cancel(int $id): SupplierPaymentResource
    {
        $payment = $this->service->cancel(SupplierPayment::query()->findOrFail($id));

        return new SupplierPaymentResource($payment->fresh(self::DETAIL));
    }

    public function methods(): JsonResponse
    {
        return response()->json(['data' => SupplierPayment::METHODS]);
    }
}
