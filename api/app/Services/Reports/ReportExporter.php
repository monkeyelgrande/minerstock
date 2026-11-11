<?php

namespace App\Services\Reports;

use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Border;
use OpenSpout\Common\Entity\Style\BorderName;
use OpenSpout\Common\Entity\Style\BorderPart;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer;

/** Convierte el resultado de un reporte en un archivo XLSX temporal. */
class ReportExporter
{
    /** @return string ruta del archivo generado */
    public function toXlsx(array $report, array $filterSummary = []): string
    {
        $path = tempnam(sys_get_temp_dir(), 'rep').'.xlsx';

        $writer = new Writer;
        $writer->openToFile($path);

        $titleStyle = (new Style)->withFontBold(true)->withFontSize(14);
        $headerStyle = (new Style)->withFontBold(true)
            ->withBackgroundColor('F8FAFC')
            ->withBorder(new Border(new BorderPart(BorderName::BOTTOM, Color::rgb(203, 213, 225))));

        $writer->addRow(Row::fromValuesWithStyle([$report['title']], $titleStyle));
        $writer->addRow(Row::fromValues(['Generado: '.now()->format('d/m/Y H:i')]));
        foreach ($filterSummary as $label => $value) {
            $writer->addRow(Row::fromValues(["{$label}: {$value}"]));
        }
        $writer->addRow(Row::fromValues([]));

        $columns = $report['columns'];
        $writer->addRow(Row::fromValuesWithStyle(array_column($columns, 'label'), $headerStyle));

        foreach ($report['rows'] as $row) {
            $writer->addRow(Row::fromValues(array_map(fn ($c) => $row[$c['key']] ?? null, $columns)));
        }

        if (! empty($report['totals'])) {
            $writer->addRow(Row::fromValues([]));
            $boldStyle = (new Style)->withFontBold(true);
            foreach ($report['totals'] as $key => $value) {
                $label = ucfirst(str_replace('_', ' ', $key));
                $writer->addRow(Row::fromValuesWithStyle(["Total {$label}", $value], $boldStyle));
            }
        }

        $writer->close();

        return $path;
    }
}
