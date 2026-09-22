<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{ $issue->number }}</title>
<style>
  * { font-family: DejaVu Sans, sans-serif; }
  body { font-size: 11px; color: #1f2937; margin: 0; }
  .header { width: 100%; border-bottom: 3px solid #f59e0b; padding-bottom: 8px; margin-bottom: 14px; }
  .header td { vertical-align: top; }
  .brand { font-size: 20px; font-weight: bold; color: #0f172a; }
  .muted { color: #6b7280; }
  .doc-title { font-size: 16px; font-weight: bold; text-align: right; }
  .doc-number { font-size: 14px; text-align: right; color: #b45309; font-weight: bold; }
  .box { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; margin-bottom: 10px; }
  .box h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th { background: #f8fafc; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; text-align: left; padding: 6px; border-bottom: 1px solid #cbd5e1; }
  table.items td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
  .num { text-align: right; white-space: nowrap; }
  .totals td { padding: 4px 6px; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 4px; }
  .sign { margin-top: 36px; width: 100%; }
  .sign td { width: 50%; text-align: center; padding-top: 30px; }
  .sign .line { border-top: 1px solid #1f2937; margin: 0 40px; padding-top: 4px; }
</style>
</head>
<body>
@php
  $qty = fn ($n) => rtrim(rtrim(number_format((float) $n, 3, ',', '.'), '0'), ',');
  $money = fn ($n) => '$ '.number_format((float) $n, 0, ',', '.');
@endphp

<table class="header">
  <tr>
    <td>
      <div class="brand">{{ $company['name'] ?? 'MinerStock' }}</div>
      <div class="muted">
        @if(!empty($company['document_number'])) NIT {{ $company['document_number'] }} · @endif
        {{ $company['address'] ?? '' }}
        @if(!empty($company['phone'])) · Tel. {{ $company['phone'] }} @endif
      </div>
    </td>
    <td>
      <div class="doc-title">VALE DE SALIDA</div>
      <div class="doc-number">{{ $issue->number }}</div>
      <div class="muted" style="text-align:right">
        Fecha: {{ $issue->date?->format('d/m/Y') }}
        @if($issue->status->value !== 'confirmado') · {{ $issue->status->label() }} @endif
      </div>
    </td>
  </tr>
</table>

<table style="width:100%; border-collapse:separate; border-spacing:0;">
  <tr>
    <td style="width:50%; padding-right:6px;">
      <div class="box">
        <h4>Entrega</h4>
        <strong>Bodega:</strong> {{ $issue->warehouse->name }} ({{ $issue->warehouse->code }})<br>
        <strong>Entregó:</strong> {{ $issue->creator?->name ?? '—' }}
      </div>
    </td>
    <td style="width:50%; padding-left:6px;">
      <div class="box">
        <h4>Receptor</h4>
        <strong>{{ $issue->recipient->name }}</strong>
        @if($issue->recipient->document_number) <span class="muted">· CC {{ $issue->recipient->document_number }}</span> @endif<br>
        <strong>Centro de costo:</strong> {{ $issue->costCenter?->name ?? '—' }}
      </div>
    </td>
  </tr>
</table>

<table class="items">
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Producto</th>
      <th style="width:55px">Unidad</th>
      <th class="num" style="width:70px">Cantidad</th>
      <th class="num" style="width:80px">Costo unit.</th>
      <th class="num" style="width:90px">Valor</th>
    </tr>
  </thead>
  <tbody>
    @foreach($issue->items as $i => $item)
      <tr>
        <td class="muted">{{ $i + 1 }}</td>
        <td>
          <strong>{{ $item->product->name }}</strong><br>
          <span class="muted">{{ $item->product->sku }}
            @if((float)$item->factor !== 1.0) · 1 {{ $item->unit->code }} = {{ $qty($item->factor) }} {{ $item->product->baseUnit->code }} @endif
            @if($item->notes) · {{ $item->notes }} @endif
          </span>
        </td>
        <td>{{ $item->unit->code }}</td>
        <td class="num">{{ $qty($item->quantity) }}</td>
        <td class="num">{{ $money($item->unit_cost) }} <span class="muted">/ {{ $item->product->baseUnit->code }}</span></td>
        <td class="num">{{ $money((float) $item->qty_base * (float) $item->unit_cost) }}</td>
      </tr>
    @endforeach
  </tbody>
  <tfoot>
    <tr class="totals">
      <td colspan="5" class="num"><strong>Total</strong></td>
      <td class="num"><strong>{{ $money($issue->total()) }}</strong></td>
    </tr>
  </tfoot>
</table>

@if($issue->notes)
  <div class="box" style="margin-top:10px"><h4>Observaciones</h4>{{ $issue->notes }}</div>
@endif

<table class="sign">
  <tr>
    <td><div class="line">Entregó<br><span class="muted">{{ $issue->creator?->name ?? 'Firma' }}</span></div></td>
    <td><div class="line">Recibí conforme<br><span class="muted">{{ $issue->recipient->name }} · Firma y cédula</span></div></td>
  </tr>
</table>

<div class="footer">{{ $company['name'] ?? 'MinerStock' }} · Vale {{ $issue->number }} · Generado el {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
