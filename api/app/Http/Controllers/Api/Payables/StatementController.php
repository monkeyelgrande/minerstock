<?php

namespace App\Http\Controllers\Api\Payables;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Services\Payables\StatementService;
use Illuminate\Http\JsonResponse;

class StatementController extends Controller
{
    public function __construct(private readonly StatementService $service) {}

    /** Resumen de saldos por proveedor. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->service->summary()]);
    }

    /** Estado de cuenta detallado de un proveedor. */
    public function show(int $supplierId): JsonResponse
    {
        $supplier = Supplier::query()->findOrFail($supplierId);

        return response()->json(['data' => $this->service->forSupplier($supplier)]);
    }
}
