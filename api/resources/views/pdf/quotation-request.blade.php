<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{ $quotation->number }}</title>
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
  table.items td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; }
  .num { text-align: right; white-space: nowrap; }
  .blank { border-bottom: 1px dotted #9ca3af; min-width: 80px; display: inline-block; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 4px; }
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
        @if(!empty($company['email'])) · {{ $company['email'] }} @endif
      </div>
    </td>
    <td>
      <div class="doc-title">SOLICITUD DE COTIZACIÓN</div>
      <div class="doc-number">{{ $quotation->number }}</div>
      <div class="muted" style="text-align:right">Fecha: {{ $quotation->date?->format('d/m/Y') }}</div>
    </td>
  </tr>
</table>

<div class="box">
  <h4>Proveedor</h4>
  <strong>{{ $quotation->supplier->name }}</strong>
  <span class="muted">· NIT {{ $quotation->supplier->document_number }}</span><br>
  @if($quotation->supplier->contact_name) {{ $quotation->supplier->contact_name }} @endif
  @if($quotation->supplier->phone) · {{ $quotation->supplier->phone }} @endif
  @if($quotation->supplier->email) · {{ $quotation->supplier->email }} @endif
</div>

<p style="font-size:11px">
  Agradecemos cotizar los siguientes productos indicando <strong>precio unitario, IVA y tiempo de entrega</strong>.
  Si algún producto no está disponible, márquelo como "No cotiza".
</p>

<table class="items">
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Producto</th>
      <th style="width:60px">Unidad</th>
      <th class="num" style="width:70px">Cantidad</th>
      <th class="num" style="width:100px">Precio unitario</th>
      <th class="num" style="width:50px">IVA %</th>
      <th class="num" style="width:80px">Entrega (días)</th>
    </tr>
  </thead>
  <tbody>
    @foreach($quotation->items as $i => $item)
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
        <td class="num"><span class="blank">&nbsp;</span></td>
        <td class="num"><span class="blank" style="min-width:30px">&nbsp;</span></td>
        <td class="num"><span class="blank" style="min-width:50px">&nbsp;</span></td>
      </tr>
    @endforeach
  </tbody>
</table>

@if($quotation->notes)
  <div class="box" style="margin-top:10px"><h4>Observaciones</h4>{{ $quotation->notes }}</div>
@endif

<div class="note">
  Favor responder citando el número <strong>{{ $quotation->number }}</strong>
  @if($quotation->valid_until) antes del <strong>{{ $quotation->valid_until->format('d/m/Y') }}</strong>@endif.
  Elaborada por {{ $quotation->creator?->name }}.
</div>

<div class="footer">{{ $company['name'] ?? 'MinerStock' }} · Solicitud de cotización {{ $quotation->number }} · Generado el {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
