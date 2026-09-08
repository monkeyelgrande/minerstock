<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{ $shipment->number }}</title>
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
  .check { width: 60px; border-bottom: 1px dotted #9ca3af; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 4px; }
  .sign { margin-top: 36px; width: 100%; }
  .sign td { width: 33%; text-align: center; padding-top: 30px; }
  .sign .line { border-top: 1px solid #1f2937; margin: 0 16px; padding-top: 4px; }
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
      <div class="doc-title">PLANILLA DE VIAJE</div>
      <div class="doc-number">{{ $shipment->number }}</div>
      <div class="muted" style="text-align:right">
        @if($shipment->dispatched_at) Despachada: {{ $shipment->dispatched_at->format('d/m/Y H:i') }} @else Borrador @endif
      </div>
    </td>
  </tr>
</table>

<table style="width:100%; border-collapse:separate; border-spacing:0;">
  <tr>
    <td style="width:50%; padding-right:6px;">
      <div class="box">
        <h4>Ruta</h4>
        <strong>Origen:</strong> {{ $shipment->origin->name }} ({{ $shipment->origin->code }})
        <span class="muted">· {{ $shipment->origin->site?->name }}</span><br>
        <strong>Destino:</strong> {{ $shipment->destination->name }} ({{ $shipment->destination->code }})
        <span class="muted">· {{ $shipment->destination->site?->name }}</span>
      </div>
    </td>
    <td style="width:50%; padding-left:6px;">
      <div class="box">
        <h4>Transporte</h4>
        <strong>Vehículo:</strong> {{ $shipment->vehicle?->plate ?? '—' }}
        @if($shipment->vehicle) <span class="muted">{{ $shipment->vehicle->type }} {{ $shipment->vehicle->brand }}</span> @endif<br>
        <strong>Chofer:</strong> {{ $shipment->driver?->name ?? '—' }}
        @if($shipment->driver) <span class="muted">· CC {{ $shipment->driver->document_number }} · Tel. {{ $shipment->driver->phone }}</span> @endif
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
      <th style="width:70px">Solicitud</th>
      <th class="num" style="width:70px">Recibido ✓</th>
    </tr>
  </thead>
  <tbody>
    @foreach($shipment->items as $i => $item)
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
        <td>{{ $item->requestItem?->request?->number ?? '—' }}</td>
        <td class="num"><span class="check">&nbsp;</span></td>
      </tr>
    @endforeach
  </tbody>
</table>

@if($shipment->notes)
  <div class="box" style="margin-top:10px"><h4>Observaciones</h4>{{ $shipment->notes }}</div>
@endif

<div class="note">
  El bodeguero de destino verifica cantidades contra esta planilla, registra las novedades
  (faltantes, dañados o sobrantes) y adjunta en el sistema la foto de esta planilla firmada.
</div>

<table class="sign">
  <tr>
    <td><div class="line">Despachó<br><span class="muted">{{ $shipment->dispatcher?->name ?? $shipment->creator?->name }}</span></div></td>
    <td><div class="line">Chofer<br><span class="muted">{{ $shipment->driver?->name ?? 'Firma y cédula' }}</span></div></td>
    <td><div class="line">Recibió en destino<br><span class="muted">Firma y fecha</span></div></td>
  </tr>
</table>

<div class="footer">{{ $company['name'] ?? 'MinerStock' }} · Planilla {{ $shipment->number }} · Generado el {{ now()->format('d/m/Y H:i') }}</div>
</body>
</html>
