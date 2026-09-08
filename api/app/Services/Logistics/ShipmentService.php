<?php

namespace App\Services\Logistics;

use App\Enums\ShipmentStatus as S;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Shipment;
use App\Models\ShipmentItem;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use App\Services\Purchasing\LineItems;
use App\Services\Purchasing\PurchaseRequestService;
use Illuminate\Support\Facades\DB;

class ShipmentService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly PurchaseRequestService $requests,
    ) {}

    /** Crea o actualiza una planilla en borrador. */
    public function save(?Shipment $shipment, array $data, User $user): Shipment
    {
        if ($shipment && ! $shipment->status->isEditable()) {
            throw new DomainException('Solo se pueden editar planillas en borrador.');
        }
        if ((int) $data['origin_warehouse_id'] === (int) $data['destination_warehouse_id']) {
            throw new DomainException('La bodega origen y la destino deben ser distintas.');
        }

        return DB::transaction(function () use ($shipment, $data, $user) {
            $attrs = [
                'origin_warehouse_id' => $data['origin_warehouse_id'],
                'destination_warehouse_id' => $data['destination_warehouse_id'],
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'driver_id' => $data['driver_id'] ?? null,
                'notes' => $data['notes'] ?? null,
            ];

            if ($shipment) {
                $shipment->fill($attrs)->save();
            } else {
                $shipment = Shipment::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $products = LineItems::productsFor($data['items']);
            $requestItems = PurchaseRequestItem::query()->with('request')
                ->whereIn('id', collect($data['items'])->pluck('purchase_request_item_id')->filter())
                ->get()->keyBy('id');

            LineItems::sync($shipment->items(), $data['items'], function (array $line) use ($products, $requestItems, $shipment) {
                $product = $products->get((int) $line['product_id'])
                    ?? throw new DomainException('Producto no encontrado.');
                $factor = LineItems::factorFor($product, (int) $line['unit_id']);

                $reqItemId = $line['purchase_request_item_id'] ?? null;
                if ($reqItemId) {
                    $reqItem = $requestItems->get((int) $reqItemId)
                        ?? throw new DomainException('Ítem de solicitud no encontrado.');
                    if ((int) $reqItem->product_id !== (int) $product->id) {
                        throw new DomainException("El ítem de solicitud no corresponde al producto {$product->sku}.");
                    }
                    if ((int) $reqItem->request->warehouse_id !== (int) $shipment->destination_warehouse_id) {
                        throw new DomainException("La solicitud {$reqItem->request->number} no es de la bodega destino.");
                    }
                }

                $qty = (float) $line['quantity'];

                return [
                    'product_id' => $product->id,
                    'purchase_request_item_id' => $reqItemId,
                    'unit_id' => (int) $line['unit_id'],
                    'factor' => $factor,
                    'quantity' => $qty,
                    'qty_base' => round($qty * $factor, 3),
                    'notes' => $line['notes'] ?? null,
                ];
            });

            return $shipment->refresh();
        });
    }

    /** Despacha: salidas del kardex en origen (al promedio) y acumulados de las solicitudes. */
    public function dispatch(Shipment $shipment, User $user): Shipment
    {
        $this->assertStatus($shipment, [S::Borrador], 'despachar');
        if ($shipment->items()->count() === 0) {
            throw new DomainException('La planilla no tiene ítems.');
        }

        return DB::transaction(function () use ($shipment, $user) {
            foreach ($shipment->items()->get() as $item) {
                $movement = $this->inventory->move(
                    $shipment->origin_warehouse_id,
                    $item->product_id,
                    StockMovementType::DespachoSalida,
                    (float) $item->qty_base,
                    null, // costo promedio actual
                    $shipment,
                    $user,
                    now(),
                    "Planilla {$shipment->number} → {$shipment->destination->name}",
                );
                $item->forceFill(['unit_cost' => (float) $movement->unit_cost])->save();

                if ($item->purchase_request_item_id) {
                    $reqItem = PurchaseRequestItem::query()->lockForUpdate()->find($item->purchase_request_item_id);
                    if ($reqItem) {
                        $reqItem->forceFill([
                            'qty_shipped_base' => (float) $reqItem->qty_shipped_base + (float) $item->qty_base,
                        ])->save();
                        $this->requests->recalcStatus(PurchaseRequest::query()->findOrFail($reqItem->purchase_request_id));
                    }
                }
            }

            $shipment->forceFill(['status' => S::Despachada, 'dispatched_at' => now(), 'dispatched_by' => $user->id])->save();

            return $shipment;
        });
    }

    /** Anula: en borrador directo; despachada sin recepciones revierte el kardex y las solicitudes. */
    public function cancel(Shipment $shipment, User $user): Shipment
    {
        $this->assertStatus($shipment, [S::Borrador, S::Despachada], 'anular');
        if ($shipment->receipts()->where('status', '!=', 'anulado')->exists()) {
            throw new DomainException('No se puede anular: la planilla tiene recepciones registradas.');
        }

        return DB::transaction(function () use ($shipment, $user) {
            if ($shipment->status === S::Despachada) {
                $this->inventory->reverse($shipment, $user, "Anulación de planilla {$shipment->number}");
                foreach ($shipment->items()->whereNotNull('purchase_request_item_id')->get() as $item) {
                    $reqItem = PurchaseRequestItem::query()->lockForUpdate()->find($item->purchase_request_item_id);
                    if ($reqItem) {
                        $reqItem->forceFill([
                            'qty_shipped_base' => max(0, (float) $reqItem->qty_shipped_base - (float) $item->qty_base),
                        ])->save();
                        $this->requests->recalcStatus(PurchaseRequest::query()->findOrFail($reqItem->purchase_request_id));
                    }
                }
            }
            $shipment->forceFill(['status' => S::Anulada])->save();

            return $shipment;
        });
    }

    public function close(Shipment $shipment): Shipment
    {
        $this->assertStatus($shipment, [S::RecibidaParcial, S::Recibida], 'cerrar');
        $shipment->forceFill(['status' => S::Cerrada])->save();

        return $shipment;
    }

    /** despachada ↔ recibida_parcial ↔ recibida según lo liquidado por las recepciones. */
    public function recalcStatus(Shipment $shipment): void
    {
        if (! in_array($shipment->status, [S::Despachada, S::RecibidaParcial, S::Recibida], true)) {
            return;
        }
        $items = $shipment->items()->get();
        $received = (float) $items->sum('qty_received_base');
        $total = (float) $items->sum('qty_base');

        $status = $received <= 0.0005
            ? S::Despachada
            : ($received + 0.0005 >= $total ? S::Recibida : S::RecibidaParcial);

        $shipment->forceFill(['status' => $status])->save();
    }

    /** Cantidad en tránsito (base) por producto, opcionalmente filtrada por bodega destino. */
    public function inTransitByProduct(?int $destinationWarehouseId = null): array
    {
        $rows = ShipmentItem::query()
            ->whereHas('shipment', function ($q) use ($destinationWarehouseId) {
                $q->whereIn('status', [S::Despachada->value, S::RecibidaParcial->value]);
                if ($destinationWarehouseId) {
                    $q->where('destination_warehouse_id', $destinationWarehouseId);
                }
            })
            ->get(['product_id', 'qty_base', 'qty_received_base', 'unit_cost']);

        $byProduct = [];
        foreach ($rows as $row) {
            $pending = max(0, (float) $row->qty_base - (float) $row->qty_received_base);
            if ($pending <= 0) {
                continue;
            }
            $byProduct[$row->product_id] ??= ['qty' => 0.0, 'value' => 0.0];
            $byProduct[$row->product_id]['qty'] += $pending;
            $byProduct[$row->product_id]['value'] += $pending * (float) $row->unit_cost;
        }

        return $byProduct;
    }

    private function assertStatus(Shipment $shipment, array $allowed, string $action): void
    {
        if (! in_array($shipment->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una planilla en estado \"{$shipment->status->label()}\".");
        }
    }
}
