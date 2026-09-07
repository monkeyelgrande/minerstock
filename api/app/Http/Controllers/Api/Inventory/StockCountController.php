<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\Inventory\StockCountResource;
use App\Models\StockCount;
use App\Services\Inventory\StockCountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class StockCountController extends Controller
{
    private const DETAIL = ['warehouse', 'counter', 'creator', 'adjustment', 'items.product.baseUnit', 'items.product.category'];

    public function __construct(private readonly StockCountService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = StockCount::query()->with(['warehouse', 'counter', 'adjustment'])->withCount('items')->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where('number', 'like', "%{$search}%");
        }

        $query->orderByDesc('created_at');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return StockCountResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(Request $request, int $id): StockCountResource
    {
        return new StockCountResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'date' => ['required', 'date'],
            'counted_by' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'notes' => ['nullable', 'string', 'max:2000'],
            'scope' => ['required', Rule::in(['all', 'category', 'products'])],
            'category_id' => ['required_if:scope,category', 'nullable', 'integer', Rule::exists('product_categories', 'id')],
            'product_ids' => ['required_if:scope,products', 'array'],
            'product_ids.*' => ['integer', Rule::exists('products', 'id')],
        ]);
        $count = $this->service->open($data, $request->user());

        return (new StockCountResource($count->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function addProducts(Request $request, int $id): StockCountResource
    {
        $data = $request->validate(['product_ids' => ['required', 'array', 'min:1'], 'product_ids.*' => ['integer', Rule::exists('products', 'id')]]);
        $count = $this->find($request, $id);
        $this->service->addProducts($count, array_map('intval', $data['product_ids']));

        return new StockCountResource($count->fresh(self::DETAIL));
    }

    public function removeProduct(Request $request, int $id, int $productId): StockCountResource
    {
        $count = $this->find($request, $id);
        $this->service->removeProduct($count, $productId);

        return new StockCountResource($count->fresh(self::DETAIL));
    }

    public function record(Request $request, int $id): StockCountResource
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.counted_qty' => ['nullable', 'numeric', 'min:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ]);
        $count = $this->service->record($this->find($request, $id), $data['items']);

        return new StockCountResource($count->load(self::DETAIL));
    }

    public function close(Request $request, int $id): StockCountResource
    {
        return new StockCountResource($this->service->close($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): StockCountResource
    {
        return new StockCountResource($this->service->cancel($this->find($request, $id))->fresh(self::DETAIL));
    }

    private function find(Request $request, int $id): StockCount
    {
        return StockCount::query()->visibleTo($request->user())->findOrFail($id);
    }
}
