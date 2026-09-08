<?php

namespace App\Services\Logistics;

use App\Enums\SimpleDocStatus as S;
use App\Enums\StockMovementType;
use App\Exceptions\DomainException;
use App\Models\Shipment;
use App\Models\ShipmentItem;
use App\Models\ShipmentReceipt;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use Illuminate\Support\Facades\DB;

/**
 * Recepción en destino (RM). Cada línea liquida por completo el ítem de planilla que
 * incluye: lo recibido en buen estado (+ sobrantes) entra al stock; faltantes y dañados
 * quedan como novedades abiertas para que el municipio las gestione.
 */
class ShipmentReceiptService
{
    public function __construct(private readonly InventoryService $inventory) {}

    public function save(?ShipmentReceipt $receipt, array $data, User $user): ShipmentReceipt
    {
        if ($receipt && ! $receipt->status->isEditable()) {
            throw new DomainException('Solo se pueden editar recepciones en borrador.');
        }

        return DB::transaction(function () use ($receipt, $data, $user) {
            $shipment = Shipment::query()->with('items.product')->findOrFail($data['shipment_id']);
            if (! $shipment->status->canReceive()) {
                throw new DomainException("La planilla {$shipment->number} no está despachada o ya fue recibida por completo.");
            }
            if ($receipt && (int) $receipt->shipment_id !== (int) $shipment->id) {
                throw new DomainException('No se puede cambiar la planilla de una recepción.');
            }
            $this->assertOperatesDestination($shipment, $user);

            $attrs = [
                'shipment_id' => $shipment->id,
                'received_at' => $data['received_at'],
                'received_by' => $data['received_by'] ?? $user->id,
                'notes' => $data['notes'] ?? null,
            ];

            if ($receipt) {
                $receipt->fill($attrs)->save();
            } else {
                $receipt = ShipmentReceipt::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $shipmentItems = $shipment->items->keyBy('id');
            $seen = [];
            $keep = [];
            foreach (array_values($data['items']) as $line) {
                /** @var ShipmentItem $si */
                $si = $shipmentItems->get((int) $line['shipment_item_id'])
                    ?? throw new DomainException('El ítem no pertenece a la planilla.');
                if (in_array($si->id, $seen, true)) {
                    throw new DomainException("El ítem {$si->product->name} está repetido.");
                }
                $seen[] = $si->id;

                $received = round((float) ($line['qty_received_base'] ?? 0), 3);
                $damaged = round((float) ($line['qty_damaged_base'] ?? 0), 3);
                $extra = round((float) ($line['qty_extra_base'] ?? 0), 3);
                if ($received < 0 || $damaged < 0 || $extra < 0) {
                    throw new DomainException('Las cantidades no pueden ser negativas.');
                }
                $pending = $si->pendingBase();
                if ($received + $damaged > $pending + 0.0005) {
                    throw new DomainException("Recibido + dañado de {$si->product->name} supera lo pendiente de la planilla.");
                }
                $missing = round(max(0, $pending - $received - $damaged), 3);

                $model = $receipt->items()->updateOrCreate(
                    ['shipment_item_id' => $si->id],
                    [
                        'product_id' => $si->product_id,
                        'qty_received_base' => $received,
                        'qty_missing_base' => $missing,
                        'qty_damaged_base' => $damaged,
                        'qty_extra_base' => $extra,
                        'notes' => $line['notes'] ?? null,
                    ],
                );
                $keep[] = $model->id;
            }
            $receipt->items()->whereNotIn('id', $keep)->delete();

            if ($receipt->items()->count() === 0) {
                throw new DomainException('La recepción debe incluir al menos un ítem de la planilla.');
            }

            return $receipt->refresh();
        });
    }

    /**
     * Confirma: requiere la foto de la planilla firmada, entra al stock lo recibido en
     * buen estado más los sobrantes, liquida los ítems y crea las novedades.
     */
    public function confirm(ShipmentReceipt $receipt, User $user): ShipmentReceipt
    {
        $this->assertStatus($receipt, [S::Borrador], 'confirmar');
        if (! $receipt->hasSignedSheet()) {
            throw new DomainException('Adjunta la foto de la planilla firmada por el chofer antes de confirmar.');
        }

        return DB::transaction(function () use ($receipt, $user) {
            $receipt->load('items.product', 'shipment.destination');
            $shipment = $receipt->shipment;
            $this->assertOperatesDestination($shipment, $user);
            if (! $shipment->status->canReceive()) {
                throw new DomainException("La planilla {$shipment->number} ya no admite recepciones.");
            }

            foreach ($receipt->items as $line) {
                /** @var ShipmentItem $si */
                $si = ShipmentItem::query()->lockForUpdate()->findOrFail($line->shipment_item_id);
                $pending = $si->pendingBase();
                $received = (float) $line->qty_received_base;
                $damaged = (float) $line->qty_damaged_base;
                $extra = (float) $line->qty_extra_base;
                if ($received + $damaged > $pending + 0.0005) {
                    throw new DomainException("Recibido + dañado de {$line->product->name} supera lo pendiente.");
                }
                // Recalcular el faltante con el pendiente real al confirmar.
                $missing = round(max(0, $pending - $received - $damaged), 3);
                $line->forceFill(['qty_missing_base' => $missing])->save();

                $inbound = round($received + $extra, 3);
                if ($inbound > 0) {
                    $this->inventory->move(
                        $shipment->destination_warehouse_id,
                        $line->product_id,
                        StockMovementType::RecepcionPlanillaEntrada,
                        $inbound,
                        (float) $si->unit_cost,
                        $receipt,
                        $user,
                        $receipt->received_at?->setTimeFrom(now()),
                        "Recepción {$receipt->number} · Planilla {$shipment->number}",
                    );
                }

                foreach ([['faltante', $missing], ['dañado', $damaged], ['sobrante', $extra]] as [$type, $qty]) {
                    if ($qty > 0.0005) {
                        $line->novelties()->create([
                            'type' => $type,
                            'qty_base' => $qty,
                            'description' => $line->notes,
                            'status' => 'abierta',
                        ]);
                    }
                }

                // La línea liquida todo el pendiente del ítem (recibido + dañado + faltante).
                $si->forceFill(['qty_received_base' => round((float) $si->qty_received_base + $pending, 3)])->save();
            }

            $receipt->forceFill(['status' => S::Confirmado, 'confirmed_at' => now()])->save();
            app(ShipmentService::class)->recalcStatus($shipment->fresh());

            return $receipt;
        });
    }

    /** Anula: revierte el kardex, reabre lo liquidado y elimina las novedades no resueltas. */
    public function cancel(ShipmentReceipt $receipt, User $user): ShipmentReceipt
    {
        $this->assertStatus($receipt, [S::Borrador, S::Confirmado], 'anular');

        return DB::transaction(function () use ($receipt, $user) {
            if ($receipt->status === S::Confirmado) {
                if ($receipt->novelties()->where('shipment_novelties.status', 'resuelta')->exists()) {
                    throw new DomainException('No se puede anular: la recepción tiene novedades ya resueltas.');
                }
                $this->inventory->reverse($receipt, $user, "Anulación de recepción {$receipt->number}");
                foreach ($receipt->items as $line) {
                    $si = ShipmentItem::query()->lockForUpdate()->findOrFail($line->shipment_item_id);
                    $settled = (float) $line->qty_received_base + (float) $line->qty_damaged_base + (float) $line->qty_missing_base;
                    $si->forceFill(['qty_received_base' => max(0, round((float) $si->qty_received_base - $settled, 3))])->save();
                    $line->novelties()->delete();
                }
            }
            $receipt->forceFill(['status' => S::Anulado])->save();
            app(ShipmentService::class)->recalcStatus($receipt->shipment()->first());

            return $receipt;
        });
    }

    private function assertOperatesDestination(Shipment $shipment, User $user): void
    {
        if ($user->seesAllWarehouses()) {
            return;
        }
        if (! $user->warehouses()->where('warehouses.id', $shipment->destination_warehouse_id)->exists()) {
            throw new DomainException('Solo el bodeguero de la bodega destino puede registrar esta recepción.');
        }
    }

    private function assertStatus(ShipmentReceipt $receipt, array $allowed, string $action): void
    {
        if (! in_array($receipt->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una recepción en estado \"{$receipt->status->label('f')}\".");
        }
    }
}
