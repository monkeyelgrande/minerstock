<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Enums\StockMovementType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Inventory\StockMovementResource;
use App\Services\Inventory\StockQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;

class StockController extends Controller
{
    public function __construct(private readonly StockQueryService $stock) {}

    /** Matriz producto × bodega con totales. */
    public function matrix(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'warehouse_id' => ['nullable', 'integer'],
            'category_id' => ['nullable', 'integer'],
            'kind' => ['nullable', 'string'],
            'search' => ['nullable', 'string', 'max:100'],
            'below_min' => ['nullable', 'boolean'],
        ]);
        $perPage = min(max((int) $request->query('per_page', 25), 1), 200);
        $result = $this->stock->matrix($request->user(), $filters, $perPage);
        $page = $result['rows'];

        return response()->json([
            'data' => $page->items(),
            'warehouses' => $result['warehouses'],
            'totals' => $result['totals'],
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $whIds = $this->stock->warehousesFor($request->user())->pluck('id')->all();
        if ($wh = $request->query('warehouse_id')) {
            $whIds = array_values(array_intersect($whIds, [(int) $wh]));
        }

        return response()->json(['data' => $this->stock->totals($whIds)]);
    }

    public function kardex(Request $request): ResourceCollection
    {
        $filters = $request->validate([
            'warehouse_id' => ['nullable', 'integer'],
            'product_id' => ['nullable', 'integer'],
            'type' => ['nullable', 'string'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);
        $perPage = min(max((int) $request->query('per_page', 50), 1), 200);

        return StockMovementResource::collection($this->stock->kardex($request->user(), $filters, $perPage)->appends($request->query()));
    }

    public function productBalances(Request $request, int $productId): JsonResponse
    {
        return response()->json(['data' => $this->stock->productBalances($request->user(), $productId)]);
    }

    public function movementTypes(): JsonResponse
    {
        return response()->json(['data' => collect(StockMovementType::cases())->map(fn ($t) => ['value' => $t->value, 'label' => $t->label(), 'inbound' => $t->isInbound()])]);
    }
}
