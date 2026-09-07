<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\Inventory\SupplierReturnResource;
use App\Models\SupplierReturn;
use App\Services\Inventory\SupplierReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class SupplierReturnController extends Controller
{
    private const DETAIL = [
        'supplier', 'receipt.order', 'warehouse', 'creator',
        'items.product.baseUnit', 'items.receiptItem', 'attachments.uploader',
    ];

    public function __construct(private readonly SupplierReturnService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = SupplierReturn::query()->with(['supplier', 'receipt', 'warehouse'])->withCount('items')->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($supplier = $request->query('supplier_id')) {
            $query->where('supplier_id', $supplier);
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($receipt = $request->query('goods_receipt_id')) {
            $query->where('goods_receipt_id', $receipt);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$search}%"))
                ->orWhereHas('receipt', fn ($r) => $r->where('number', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'date', 'status', 'total_cost'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return SupplierReturnResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(Request $request, int $id): SupplierReturnResource
    {
        return new SupplierReturnResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $return = $this->service->save(null, $data, $request->user());

        return (new SupplierReturnResource($return->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): SupplierReturnResource
    {
        $return = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new SupplierReturnResource($this->service->save($return, $data, $request->user())->load(self::DETAIL));
    }

    public function confirm(Request $request, int $id): SupplierReturnResource
    {
        return new SupplierReturnResource($this->service->confirm($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): SupplierReturnResource
    {
        return new SupplierReturnResource($this->service->cancel($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function reasons(): JsonResponse
    {
        return response()->json(['data' => SupplierReturn::REASONS]);
    }

    private function find(Request $request, int $id): SupplierReturn
    {
        return SupplierReturn::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'goods_receipt_id' => ['required', 'integer', Rule::exists('goods_receipts', 'id')],
            'date' => ['required', 'date'],
            'reason' => ['required', Rule::in(array_keys(SupplierReturn::REASONS))],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.goods_receipt_item_id' => ['required', 'integer', Rule::exists('goods_receipt_items', 'id')],
            'items.*.qty_base' => ['required', 'numeric', 'gt:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
