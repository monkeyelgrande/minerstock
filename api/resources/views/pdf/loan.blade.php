<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{ $loan->number }}</title>
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
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 4px; }
  .sign { margin-top: 36px; width: 100%; }
  .sign td { width: 50%; text-align: center; padding-top: 30px; }
  .sign .line { border-top: 1px solid #1f2937; margin: 0 40px; padding-top: 4px; }
  .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 8px; font-size: 10px; margin-top: 10px; }
</style>
</head>
<body>
@php
  $qty = fn ($n) => rtrim(rtrim(number_format((float) $n, 3, ',', '.'), '0'), ',');
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
      <div class="doc-title">PRÉSTAMO DE HERRAMIENTAS</div>
      <div class="doc-number">{{ $loan->number }}</div>
      <div class="muted" style="text-align:right">
        Fecha: {{ $loan->loaned_at?->format('d/m/Y') }}
        @if($loan->status->value === 'borrador') · Borrador @endif
      </div>
    </td>
  </tr>
</table>

<table style="width:100%; border-collapse:separate; border-spacing:0;">
  <tr>
    <td style="width:50%; padding-right:6px;">
      <div class="box">
        <h4>Préstamo</h4>
        <strong>Bodega:</strong> {{ $loan->warehouse->name }} ({{ $loan->warehouse->code }})<br>
        <strong>Entregó:</strong> {{ $loan->creator?->name ?? '—' }}<br>
        <strong>Devolución esperada:</strong> {{ $loan->expected_return_at?->format('d/m/Y') ?? 'Sin fecha' }}
      </div>
    </td>
    <td style="width:50%; padding-left:6px;">
      <div class="box">
        <h4>Receptor</h4>
        <strong>{{ $loan->recipient->name }}</strong>
        @if($loan->recipient->document_number) <span class="muted">· CC {{ $loan->recipient->document_number }}</span> @endif<br>
        <span class="muted">Responsable de la devolución de las herramientas listadas.</span>
      </div>
    </td>
  </tr>
</table>

<table class="items">
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Herramienta</th>
      <th class="num" style="width:70px">Prestado</th>
      <th class="num" style="width:70px">Devuelto</th>
      <th class="num" style="width:70px">Dañado</th>
      <th class="num" style="width:70px">Perdido</th>
      <th class="num" style="width:80px">En poder</th>
    </tr>
  </thead>
  <tbody>
    @foreach($loan->items as $i => $item)
      <tr>
        <td class="muted">{{ $i + 1 }}</td>
        <td>
          <strong>{{ $item->product->name }}</strong><br>
          <span class="muted">{{ $item->product->sku }} · {{ $item->product->baseUnit->code }}
            @if($item->notes) · {{ $item->notes }} @endif
          </span>
        </td>
        <td class="num">{{ $qty($item->qty_base) }}</td>
        <td class="num">{{ $qty($item->qty_returned_base) }}</td>
        <td class="num">{{ $qty($item->qty_damaged_base) }}</td>
        <td class="num">{{ $qty($item->qty_lost_base) }}</td>
        <td class="num"><strong>{{ $qty($item->outstandingBase()) }}</strong></td>
      </tr>
    @endforeach
  </tbody>
</table>

@if($loan->notes)
  <div class="box" style="margin-top:10px"><h4>Observaciones</h4>{{ $loan->notes }}</div>
@endif

<div class="note">
  El receptor se compromete a devolver las herramientas en buen estado
  @if($loan->expected_return_at) a más tardar el {{ $loan->expected_return_at->format('d/m/Y') }}@endif.
  Las devoluciones se registran en bodega indicando el estado de cada herramienta (bueno, dañado o perdido).
</div>

<table class="sign">
  <tr>
    <td><div class="line">Entregó<br><span class="muted">{{ $loan->creator?->name ?? 'Firma' }}</span></div></td>
    <td><div class="line">Recibí en calidad de préstamo<br><span class="muted">{{ $loan->recipient->name }} · Firma y cédula</span></div></td>
  </tr>
</table>

<div class="footer">{{ $company['name'] ?? 'MinerStock' }} · Préstamo {{ $loan->number }} · Generado el {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
