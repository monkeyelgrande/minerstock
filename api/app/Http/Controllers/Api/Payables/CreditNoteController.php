<?php

namespace App\Http\Controllers\Api\Payables;

use App\Http\Controllers\Controller;
use App\Http\Resources\Payables\SupplierCreditNoteResource;
use App\Models\SupplierCreditNote;
use App\Services\Payables\CreditNoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class CreditNoteController extends Controller
{
    private const DETAIL = ['supplier', 'supplierReturn', 'creator', 'applications.invoice', 'applications.applier', 'attachments.uploader'];

    public function __construct(private readonly CreditNoteService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = SupplierCreditNote::query()->with(['supplier', 'supplierReturn']);

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->where('supplier_id', $supplier);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhere('supplier_note_number', 'like', "%{$search}%")
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%")));
        }

        $query->orderByDesc('created_at');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return SupplierCreditNoteResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(int $id): SupplierCreditNoteResource
    {
        return new SupplierCreditNoteResource(SupplierCreditNote::query()->with(self::DETAIL)->findOrFail($id));
    }

    /** Nota crédito manual (sin devolución física). */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'supplier_note_number' => ['nullable', 'string', 'max:60'],
            'date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $note = $this->service->createManual($data, $request->user());

        return (new SupplierCreditNoteResource($note->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function apply(Request $request, int $id): SupplierCreditNoteResource
    {
        $data = $request->validate([
            'applications' => ['required', 'array', 'min:1'],
            'applications.*.supplier_invoice_id' => ['required', 'integer', Rule::exists('supplier_invoices', 'id')],
            'applications.*.amount' => ['required', 'numeric', 'min:0'],
        ]);
        $note = $this->service->apply(SupplierCreditNote::query()->findOrFail($id), $data['applications'], $request->user());

        return new SupplierCreditNoteResource($note->load(self::DETAIL));
    }

    public function removeApplication(int $id, int $applicationId): SupplierCreditNoteResource
    {
        $note = $this->service->removeApplication(SupplierCreditNote::query()->findOrFail($id), $applicationId);

        return new SupplierCreditNoteResource($note->load(self::DETAIL));
    }

    public function cancel(int $id): SupplierCreditNoteResource
    {
        $note = $this->service->cancel(SupplierCreditNote::query()->findOrFail($id));

        return new SupplierCreditNoteResource($note->fresh(self::DETAIL));
    }
}
