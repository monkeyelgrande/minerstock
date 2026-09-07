<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Resources\Inventory\AdjustmentResource;
use App\Models\Adjustment;
use App\Services\Inventory\AdjustmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;

class AdjustmentController extends Controller
{
    private const DETAIL = ['warehouse', 'creator', 'stockCount', 'items.product.baseUnit', 'attachments.uploader'];

    public function __construct(private readonly AdjustmentService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = Adjustment::query()->with(['warehouse', 'creator', 'stockCount'])->withCount('items')->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($reason = $request->query('reason')) {
            $query->where('reason', $reason);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('date', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('date', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'date', 'status', 'reason'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return AdjustmentResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function show(Request $request, int $id): AdjustmentResource
    {
        return new AdjustmentResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $adj = $this->service->save(null, $data, $request->user());

        return (new AdjustmentResource($adj->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): AdjustmentResource
    {
        $adj = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new AdjustmentResource($this->service->save($adj, $data, $request->user())->load(self::DETAIL));
    }

    public function confirm(Request $request, int $id): AdjustmentResource
    {
        return new AdjustmentResource($this->service->confirm($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): AdjustmentResource
    {
        return new AdjustmentResource($this->service->cancel($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function reasons(): JsonResponse
    {
        return response()->json(['data' => Adjustment::REASONS]);
    }

    private function find(Request $request, int $id): Adjustment
    {
        return Adjustment::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'date' => ['required', 'date'],
            'reason' => ['required', Rule::in(array_keys(Adjustment::REASONS))],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.qty_base' => ['required', 'numeric', 'not_in:0'],
            'items.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
