<?php

namespace App\Http\Controllers\Api\Consumption;

use App\Http\Controllers\Controller;
use App\Http\Resources\Consumption\LoanResource;
use App\Models\Loan;
use App\Models\LoanReturnItem;
use App\Models\Setting;
use App\Services\Consumption\LoanService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class LoanController extends Controller
{
    private const DETAIL = [
        'warehouse', 'recipient', 'creator',
        'items.product.baseUnit',
        'returns.receiver', 'returns.items.loanItem.product',
        'attachments.uploader',
    ];

    public function __construct(private readonly LoanService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = Loan::query()
            ->with(['warehouse', 'recipient', 'items'])
            ->withCount('items')
            ->visibleTo($request->user());

        if ($request->boolean('overdue')) {
            $query->overdue();
        } elseif ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($recipient = $request->query('recipient_id')) {
            $query->where('recipient_id', $recipient);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('loaned_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('loaned_at', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('recipient', fn ($r) => $r->where('name', 'like', "%{$search}%"))
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'loaned_at', 'expected_return_at', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return LoanResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function counts(Request $request): JsonResponse
    {
        $base = fn () => Loan::query()->visibleTo($request->user());
        $counts = $base()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return response()->json(['data' => $counts, 'overdue' => $base()->overdue()->count()]);
    }

    public function show(Request $request, int $id): LoanResource
    {
        return new LoanResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $loan = $this->service->save(null, $data, $request->user());

        return (new LoanResource($loan->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): LoanResource
    {
        $loan = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new LoanResource($this->service->save($loan, $data, $request->user())->load(self::DETAIL));
    }

    public function confirm(Request $request, int $id): LoanResource
    {
        return new LoanResource($this->service->confirm($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): LoanResource
    {
        return new LoanResource($this->service->cancel($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function storeReturn(Request $request, int $id): LoanResource
    {
        $loan = $this->find($request, $id);
        $data = $request->validate([
            'returned_at' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.loan_item_id' => ['required', 'integer'],
            'items.*.qty_base' => ['required', 'numeric', 'gt:0'],
            'items.*.condition' => ['required', Rule::in(array_keys(LoanReturnItem::CONDITIONS))],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ]);

        $this->service->registerReturn($loan, $data, $request->user());

        return new LoanResource($loan->fresh(self::DETAIL));
    }

    /** Herramientas por persona: saldo en préstamo agrupado por receptor. */
    public function holdings(Request $request): JsonResponse
    {
        $warehouseId = $request->query('warehouse_id') ? (int) $request->query('warehouse_id') : null;

        return response()->json(['data' => $this->service->holdings($warehouseId, $request->user())]);
    }

    public function pdf(Request $request, int $id): Response
    {
        $loan = $this->find($request, $id)->load(self::DETAIL);

        $pdf = Pdf::loadView('pdf.loan', [
            'loan' => $loan,
            'company' => Setting::get('company', []),
        ]);

        return $pdf->stream("{$loan->number}.pdf");
    }

    private function find(Request $request, int $id): Loan
    {
        return Loan::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'recipient_id' => ['required', 'integer', Rule::exists('recipients', 'id')],
            'loaned_at' => ['required', 'date'],
            'expected_return_at' => ['nullable', 'date', 'after_or_equal:loaned_at'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.qty_base' => ['required', 'numeric', 'gt:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
