<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Http\Controllers\Controller;
use App\Http\Resources\Purchasing\PurchaseOrderResource;
use App\Services\Purchasing\ComparisonService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ComparisonController extends Controller
{
    public function __construct(private readonly ComparisonService $service) {}

    /** Matriz producto × proveedor. Filtros: request_ids[], product_id, supplier_id, quotation_id, only_valid. */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'request_ids' => ['nullable', 'array'],
            'request_ids.*' => ['integer'],
            'product_id' => ['nullable', 'integer'],
            'supplier_id' => ['nullable', 'integer'],
            'quotation_id' => ['nullable', 'integer'],
            'only_valid' => ['nullable', 'boolean'],
        ]);

        return response()->json(['data' => $this->service->matrix($filters)]);
    }

    public function select(Request $request): JsonResponse
    {
        $data = $request->validate([
            'selections' => ['required', 'array', 'min:1'],
            'selections.*.quotation_item_id' => ['required', 'integer', Rule::exists('quotation_items', 'id')],
            'selections.*.selected' => ['required', 'boolean'],
        ]);
        $this->service->select($data['selections']);

        return response()->json(['message' => 'Selección guardada.']);
    }

    public function generateOrders(Request $request): JsonResponse
    {
        $data = $request->validate([
            'quotation_item_ids' => ['required', 'array', 'min:1'],
            'quotation_item_ids.*' => ['integer', Rule::exists('quotation_items', 'id')],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
        ]);
        $orders = $this->service->generateOrders($data['quotation_item_ids'], (int) $data['warehouse_id'], $request->user());

        return response()->json([
            'message' => count($orders) === 1 ? 'Se generó 1 orden de compra.' : 'Se generaron '.count($orders).' órdenes de compra.',
            'data' => PurchaseOrderResource::collection($orders->each->load(['supplier', 'warehouse', 'items.product.baseUnit', 'items.unit'])),
        ], 201);
    }
}
