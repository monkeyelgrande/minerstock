<?php

namespace App\Http\Controllers\Api\Reports;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\Reports\ReportExporter;
use App\Services\Reports\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports,
        private readonly ReportExporter $exporter,
    ) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->reports->catalog()]);
    }

    public function show(Request $request, string $key): Response
    {
        $filters = $request->only([
            'warehouse_id', 'product_id', 'category_id', 'supplier_id', 'recipient_id', 'cost_center_id',
            'movement_type', 'novelty_type', 'novelty_status', 'priority', 'date_from', 'date_to',
        ]);

        $report = $this->reports->run($key, $filters, $request->user());

        return match ($request->query('export')) {
            'xlsx' => $this->xlsx($report, $filters),
            'pdf' => $this->pdf($report, $filters),
            default => response()->json(['data' => $report]),
        };
    }

    private function xlsx(array $report, array $filters): Response
    {
        $path = $this->exporter->toXlsx($report, $this->filterSummary($filters));
        $name = str($report['title'])->slug().'-'.now()->format('Ymd-Hi').'.xlsx';

        return response()->download($path, $name, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    private function pdf(array $report, array $filters): Response
    {
        $pdf = Pdf::loadView('pdf.report', [
            'report' => $report,
            'filters' => $this->filterSummary($filters),
            'company' => Setting::get('company', []),
        ])->setPaper('letter', 'landscape');

        return $pdf->stream(str($report['title'])->slug().'.pdf');
    }

    /** Resumen legible de los filtros aplicados (solo fechas; el resto ya acota las filas). */
    private function filterSummary(array $filters): array
    {
        $summary = [];
        if (! empty($filters['date_from'])) {
            $summary['Desde'] = $filters['date_from'];
        }
        if (! empty($filters['date_to'])) {
            $summary['Hasta'] = $filters['date_to'];
        }

        return $summary;
    }
}
