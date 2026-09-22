<?php

namespace App\Http\Controllers\Api\Consumption;

use App\Http\Controllers\Controller;
use App\Http\Resources\Consumption\IssueResource;
use App\Models\Issue;
use App\Models\Setting;
use App\Services\Consumption\IssueService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class IssueController extends Controller
{
    private const DETAIL = [
        'warehouse', 'recipient', 'costCenter', 'creator',
        'items.product.baseUnit', 'items.unit', 'attachments.uploader',
    ];

    public function __construct(private readonly IssueService $service) {}

    public function index(Request $request): ResourceCollection
    {
        $query = Issue::query()
            ->with(['warehouse', 'recipient', 'costCenter', 'items'])
            ->withCount('items')
            ->visibleTo($request->user());

        if ($status = $request->query('status')) {
            $query->whereIn('status', is_array($status) ? $status : explode(',', $status));
        }
        if ($wh = $request->query('warehouse_id')) {
            $query->where('warehouse_id', $wh);
        }
        if ($recipient = $request->query('recipient_id')) {
            $query->where('recipient_id', $recipient);
        }
        if ($cc = $request->query('cost_center_id')) {
            $query->where('cost_center_id', $cc);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('date', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('date', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('number', 'like', "%{$search}%")
                ->orWhereHas('recipient', fn ($r) => $r->where('name', 'like', "%{$search}%"))
                ->orWhereHas('items.product', fn ($p) => $p->where('name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%")));
        }

        $sort = in_array($request->query('sort'), ['number', 'date', 'status'], true) ? $request->query('sort') : 'created_at';
        $query->orderBy($sort, $request->query('dir') === 'asc' ? 'asc' : 'desc');
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);

        return IssueResource::collection($query->paginate($perPage)->appends($request->query()));
    }

    public function counts(Request $request): JsonResponse
    {
        $counts = Issue::query()->visibleTo($request->user())
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')->pluck('total', 'status');

        return response()->json(['data' => $counts]);
    }

    public function show(Request $request, int $id): IssueResource
    {
        return new IssueResource($this->find($request, $id)->load(self::DETAIL));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $issue = $this->service->save(null, $data, $request->user());

        return (new IssueResource($issue->load(self::DETAIL)))->response()->setStatusCode(201);
    }

    public function update(Request $request, int $id): IssueResource
    {
        $issue = $this->find($request, $id);
        $data = $request->validate($this->rules());

        return new IssueResource($this->service->save($issue, $data, $request->user())->load(self::DETAIL));
    }

    public function confirm(Request $request, int $id): IssueResource
    {
        return new IssueResource($this->service->confirm($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function cancel(Request $request, int $id): IssueResource
    {
        return new IssueResource($this->service->cancel($this->find($request, $id), $request->user())->fresh(self::DETAIL));
    }

    public function pdf(Request $request, int $id): Response
    {
        $issue = $this->find($request, $id)->load(self::DETAIL);

        $pdf = Pdf::loadView('pdf.issue-voucher', [
            'issue' => $issue,
            'company' => Setting::get('company', []),
        ]);

        return $pdf->stream("{$issue->number}.pdf");
    }

    private function find(Request $request, int $id): Issue
    {
        return Issue::query()->visibleTo($request->user())->findOrFail($id);
    }

    private function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')],
            'recipient_id' => ['required', 'integer', Rule::exists('recipients', 'id')],
            'cost_center_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')],
            'date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['required', 'integer', Rule::exists('products', 'id')],
            'items.*.unit_id' => ['required', 'integer', Rule::exists('units', 'id')],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
