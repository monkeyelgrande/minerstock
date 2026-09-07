<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{ $po->number }}</title>
<style>
  * { font-family: DejaVu Sans, sans-serif; }
  body { font-size: 11px; color: #1f2937; margin: 0; }
  .header { width: 100%; border-bottom: 3px solid #f59e0b; padding-bottom: 8px; margin-bottom: 14px; }
  .header td { vertical-align: top; }
  .brand { font-size: 20px; font-weight: bold; color: #0f172a; }
  .brand span { color: #f59e0b; }
  .muted { color: #6b7280; }
  .doc-title { font-size: 16px; font-weight: bold; text-align: right; }
  .doc-number { font-size: 14px; text-align: right; color: #b45309; font-weight: bold; }
  .box { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; margin-bottom: 10px; }
  .box h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th { background: #f8fafc; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; text-align: left; padding: 6px 6px; border-bottom: 1px solid #cbd5e1; }
  table.items td { padding: 6px 6px; border-bottom: 1px solid #e5e7eb; }
  .num { text-align: right; white-space: nowrap; }
  .totals { width: 260px; margin-left: auto; margin-top: 8px; border-collapse: collapse; }
  .totals td { padding: 4px 6px; }
  .totals .grand td { font-weight: bold; font-size: 13px; border-top: 2px solid #0f172a; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 4px; }
  .sign { margin-top: 40px; width: 100%; }
  .sign td { width: 33%; text-align: center; padding-top: 30px; }
  .sign .line { border-top: 1px solid #1f2937; margin: 0 20px; padding-top: 4px; }
</style>
</head>
<body>
@php
  $fmt = fn ($n, $d = 0) => number_format((float) $n, $d, ',', '.');
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
      <div class="doc-title">ORDEN DE COMPRA</div>
      <div class="doc-number">{{ $po->number }}</div>
      <div class="muted" style="text-align:right">Fecha: {{ $po->date?->format('d/m/Y') }}
        @if($po->expected_date) · Entrega esperada: {{ $po->expected_date->format('d/m/Y') }} @endif
      </div>
    </td>
  </tr>
</table>

<table style="width:100%; border-collapse:separate; border-spacing:0 0;">
  <tr>
    <td style="width:50%; padding-right:6px;">
      <div class="box">
        <h4>Proveedor</h4>
        <strong>{{ $po->supplier->name }}</strong><br>
        <span class="muted">NIT {{ $po->supplier->document_number }}</span><br>
        @if($po->supplier->contact_name) {{ $po->supplier->contact_name }} @endif
        @if($po->supplier->phone) · {{ $po->supplier->phone }} @endif
        @if($po->supplier->email) <br>{{ $po->supplier->email }} @endif
      </div>
    </td>
    <td style="width:50%; padding-left:6px;">
      <div class="box">
        <h4>Entregar en</h4>
        <strong>{{ $po->warehouse->name }}</strong> <span class="muted">({{ $po->warehouse->code }})</span><br>
        <span class="muted">{{ $po->warehouse->site?->name }} {{ $po->warehouse->site?->address ? '· '.$po->warehouse->site->address : '' }}</span><br>
        Forma de pago: <strong>{{ $po->payment_terms === 'credito' ? 'Crédito a '.$po->payment_days.' días' : 'Contado' }}</strong>
      </div>
    </td>
  </tr>
</table>

<table class="items">
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Producto</th>
      <th style="width:60px">Unidad</th>
      <th class="num" style="width:70px">Cantidad</th>
      <th class="num" style="width:90px">Precio unit.</th>
      <th class="num" style="width:45px">IVA</th>
      <th class="num" style="width:95px">Total</th>
    </tr>
  </thead>
  <tbody>
    @foreach($po->items as $i => $item)
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
        <td class="num">$ {{ $fmt($item->unit_price) }}</td>
        <td class="num">{{ $fmt($item->tax_rate) }}%</td>
        <td class="num">$ {{ $fmt($item->line_total) }}</td>
      </tr>
    @endforeach
  </tbody>
</table>

<table class="totals">
  <tr><td class="muted">Subtotal</td><td class="num">$ {{ $fmt($po->subtotal) }}</td></tr>
  <tr><td class="muted">IVA</td><td class="num">$ {{ $fmt($po->tax) }}</td></tr>
  <tr class="grand"><td>Total</td><td class="num">$ {{ $fmt($po->total) }}</td></tr>
</table>

@if($po->notes)
  <div class="box" style="margin-top:10px"><h4>Observaciones</h4>{{ $po->notes }}</div>
@endif

<table class="sign">
  <tr>
    <td><div class="line">Elaboró<br><span class="muted">{{ $po->creator?->name }}</span></div></td>
    <td><div class="line">Aprobó<br><span class="muted">{{ $po->approver?->name }} {{ $po->approved_at ? '· '.$po->approved_at->format('d/m/Y') : '' }}</span></div></td>
    <td><div class="line">Proveedor<br><span class="muted">Firma y sello</span></div></td>
  </tr>
</table>

<div class="footer">{{ $company['name'] ?? 'MinerStock' }} · Orden de compra {{ $po->number }} · Generado el {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
