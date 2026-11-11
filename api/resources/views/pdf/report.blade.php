<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{ $report['title'] }}</title>
<style>
  * { font-family: DejaVu Sans, sans-serif; }
  body { font-size: 9px; color: #1f2937; margin: 0; }
  .header { width: 100%; border-bottom: 3px solid #f59e0b; padding-bottom: 6px; margin-bottom: 10px; }
  .brand { font-size: 16px; font-weight: bold; color: #0f172a; }
  .muted { color: #6b7280; }
  .doc-title { font-size: 13px; font-weight: bold; text-align: right; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { background: #f8fafc; color: #64748b; font-size: 8px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px; border-bottom: 1px solid #cbd5e1; }
  table.items td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 8px; }
  .totals td { padding: 2px 6px; font-weight: bold; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 3px; }
</style>
</head>
<body>
@php
  $fmt = function ($value, $type) {
      if ($value === null || $value === '') return '—';
      return match ($type) {
          'money' => '$ '.number_format((float) $value, 0, ',', '.'),
          'qty' => rtrim(rtrim(number_format((float) $value, 3, ',', '.'), '0'), ','),
          'number' => number_format((float) $value, 0, ',', '.'),
          default => $value,
      };
  };
@endphp

<table class="header">
  <tr>
    <td>
      <div class="brand">{{ $company['name'] ?? 'MinerStock' }}</div>
      <div class="muted">
        @foreach($filters as $label => $value) {{ $label }}: {{ $value }} · @endforeach
        Generado el {{ now()->format('d/m/Y H:i') }}
      </div>
    </td>
    <td>
      <div class="doc-title">{{ mb_strtoupper($report['title']) }}</div>
      <div class="muted" style="text-align:right">{{ count($report['rows']) }} filas</div>
    </td>
  </tr>
</table>

<table class="items">
  <thead>
    <tr>
      @foreach($report['columns'] as $col)
        <th @class(['num' => in_array($col['type'], ['money', 'qty', 'number'])])>{{ $col['label'] }}</th>
      @endforeach
    </tr>
  </thead>
  <tbody>
    @forelse($report['rows'] as $row)
      <tr>
        @foreach($report['columns'] as $col)
          <td @class(['num' => in_array($col['type'], ['money', 'qty', 'number'])])>{{ $fmt($row[$col['key']] ?? null, $col['type']) }}</td>
        @endforeach
      </tr>
    @empty
      <tr><td colspan="{{ count($report['columns']) }}" class="muted">Sin resultados para los filtros aplicados.</td></tr>
    @endforelse
  </tbody>
</table>

@if(!empty($report['totals']))
  <table class="totals">
    @foreach($report['totals'] as $key => $value)
      <tr>
        <td>Total {{ ucfirst(str_replace('_', ' ', $key)) }}</td>
        <td class="num">{{ in_array($key, ['entrada', 'salida']) ? $fmt($value, 'qty') : $fmt($value, 'money') }}</td>
      </tr>
    @endforeach
  </table>
@endif

<div class="footer">{{ $company['name'] ?? 'MinerStock' }} · {{ $report['title'] }} · Generado el {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
