<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Http\Controllers\Controller;
use App\Http\Resources\Purchasing\QuotationResource;
use App\Models\Quotation;
use App\Services\Purchasing\QuotationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class QuotationController extends Controller
{
    private const DETAIL = [
        'supplier', 'creator', 'items.product.baseUnit', 'items.unit', 'items.requestItem.request', 'attachments.uploader',
    ];

    public function __construct(private readonly QuotationService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = Quotation::query()->with('supplier')->withCount('items');

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->where('supplier_id', $supplier);
        }
        if ($request->boolean('only_valid')) {
            $query->where(fn ($q) => $q->whereNull('valid_until')->orWhereDate('valid_until', '>=', today()));
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%"))
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'date', 'valid_until', 'total', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');

        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return QuotationResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(int $id): QuotationResource
    {
        return new QuotationResource(Quotation::query()->with(self::DETAIL)->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $q = $this->service->save(null, $data, $request->user());

        return (new QuotationResource($q->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): QuotationResource
    {
        $q = Quotation::query()->findOrFail($id);
        $data = $request->validate($this->rules());
        $q = $this->service->save($q, $data, $request->user());

        return new QuotationResource($q->load(self::DETAIL));
    }

    public function destroy(int $id): JsonResponse
    {
        $this->service->delete(Quotation::query()->findOrFail($id));

        return response()->json(null, 204);
    }

    public function receive(int $id): QuotationResource
    {
        $q = $this->service->markReceived(Quotation::query()->findOrFail($id));

        return new QuotationResource($q->fresh(self::DETAIL));
    }

    public function discard(int $id): QuotationResource
    {
        $q = $this->service->discard(Quotation::query()->findOrFail($id));

        return new QuotationResource($q->fresh(self::DETAIL));
    }

    private function rules(): array
    {
        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'date' => ['required', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.purchase_request_item_id' => ['nullable', 'integer', Rule::exists('purchase_request_items', 'id')],
            'items.*.unit_id' => ['required', 'integer', Rule::exists('units', 'id')],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.delivery_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
