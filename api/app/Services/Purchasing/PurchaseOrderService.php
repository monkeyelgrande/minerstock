<?php

namespace App\Services\Purchasing;

use App\Enums\PurchaseOrderStatus as S;
use App\Exceptions\DomainException;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PurchaseOrderService
{
    public function __construct(private readonly PurchaseRequestService $requests) {}

    public function save(?PurchaseOrder $order, array $data, User $user): PurchaseOrder
    {
        if ($order && ! $order->status->isEditable()) {
            throw new DomainException('Solo se pueden editar órdenes en borrador o rechazadas.');
        }

        return DB::transaction(function () use ($order, $data, $user) {
            $supplier = Supplier::query()->findOrFail($data['supplier_id']);
            $attrs = [
                'supplier_id' => $supplier->id,
                'warehouse_id' => $data['warehouse_id'],
                'date' => $data['date'],
                'expected_date' => $data['expected_date'] ?? null,
                'payment_terms' => $data['payment_terms'] ?? ($supplier->payment_terms_days > 0 ? 'credito' : 'contado'),
                'payment_days' => $data['payment_days'] ?? $supplier->payment_terms_days,
                'notes' => $data['notes'] ?? null,
            ];
            if (($attrs['payment_terms'] ?? 'contado') === 'contado') {
                $attrs['payment_days'] = 0;
            }

            if ($order) {
                $attrs['status'] = S::Borrador;
                $attrs['rejection_reason'] = null;
                $order->fill($attrs)->save();
            } else {
                $order = PurchaseOrder::query()->create($attrs + ['created_by' => $user->id, 'status' => S::Borrador]);
            }

            $products = LineItems::productsFor($data['items']);
            $requestItems = PurchaseRequestItem::query()->with('request')
                ->whereIn('id', collect($data['items'])->pluck('purchase_request_item_id')->filter())
                ->get()->keyBy('id');

            LineItems::sync($order->items(), $data['items'], function (array $line) use ($products, $requestItems) {
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
                }

                $qty = (float) $line['quantity'];
                $price = (float) $line['unit_price'];

                return [
                    'product_id' => $product->id,
                    'purchase_request_item_id' => $reqItemId,
                    'quotation_item_id' => $line['quotation_item_id'] ?? null,
                    'unit_id' => (int) $line['unit_id'],
                    'factor' => $factor,
                    'quantity' => $qty,
                    'qty_base' => round($qty * $factor, 3),
                    'unit_price' => $price,
                    'tax_rate' => $line['tax_rate'] ?? 0,
                    'line_total' => round($qty * $price, 2),
                    'notes' => $line['notes'] ?? null,
                ];
            });

            $order->load('items')->recalcTotals();

            return $order->refresh();
        });
    }

    public function submit(PurchaseOrder $order, User $user): PurchaseOrder
    {
        $this->assertStatus($order, [S::Borrador, S::Rechazada], 'enviar a aprobación');
        if ($order->items()->count() === 0) {
            throw new DomainException('La orden no tiene ítems.');
        }

        return DB::transaction(function () use ($order, $user) {
            $order->forceFill(['status' => S::PendienteAprobacion, 'submitted_at' => now(), 'rejection_reason' => null])->save();
            $order->approvals()->create(['requested_by' => $user->id, 'status' => 'pendiente']);

            return $order;
        });
    }

    /** Aprobar compromete las cantidades en las solicitudes de origen. */
    public function approve(PurchaseOrder $order, User $user, ?string $comment = null): PurchaseOrder
    {
        $this->assertStatus($order, [S::PendienteAprobacion], 'aprobar');

        return DB::transaction(function () use ($order, $user, $comment) {
            $order->forceFill(['status' => S::Aprobada, 'approved_by' => $user->id, 'approved_at' => now()])->save();
            $this->decide($order, $user, 'aprobada', $comment);
            $this->commitQuantities($order, +1);

            return $order;
        });
    }

    public function reject(PurchaseOrder $order, User $user, string $reason): PurchaseOrder
    {
        $this->assertStatus($order, [S::PendienteAprobacion], 'rechazar');

        return DB::transaction(function () use ($order, $user, $reason) {
            $order->forceFill(['status' => S::Rechazada, 'rejection_reason' => $reason])->save();
            $this->decide($order, $user, 'rechazada', $reason);

            return $order;
        });
    }

    /** Regresa una orden aprobada (aún no emitida) a borrador para corregirla. */
    public function reopen(PurchaseOrder $order): PurchaseOrder
    {
        $this->assertStatus($order, [S::Aprobada, S::PendienteAprobacion], 'reabrir');

        return DB::transaction(function () use ($order) {
            if ($order->status === S::Aprobada) {
                $this->commitQuantities($order, -1);
            }
            $order->pendingApproval()?->update(['status' => 'rechazada', 'decided_at' => now(), 'comment' => 'Reabierta para edición']);
            $order->forceFill(['status' => S::Borrador, 'approved_by' => null, 'approved_at' => null])->save();

            return $order;
        });
    }

    public function issue(PurchaseOrder $order): PurchaseOrder
    {
        $this->assertStatus($order, [S::Aprobada], 'emitir');
        $order->forceFill(['status' => S::Emitida, 'issued_at' => now()])->save();

        return $order;
    }

    public function cancel(PurchaseOrder $order): PurchaseOrder
    {
        $this->assertStatus($order, [S::Borrador, S::PendienteAprobacion, S::Rechazada, S::Aprobada, S::Emitida], 'anular');
        if ($order->items()->where('qty_received_base', '>', 0)->exists()) {
            throw new DomainException('No se puede anular: ya tiene recepciones registradas.');
        }

        return DB::transaction(function () use ($order) {
            if ($order->status->commitsQuantities()) {
                $this->commitQuantities($order, -1);
            }
            $order->pendingApproval()?->update(['status' => 'rechazada', 'decided_at' => now(), 'comment' => 'Orden anulada']);
            $order->forceFill(['status' => S::Anulada])->save();
            // Los ítems de cotización vuelven a estar disponibles.
            $order->items()->whereNotNull('quotation_item_id')->get()->each(function ($item) {
                $item->quotationItem()->update(['purchase_order_item_id' => null, 'is_selected' => false]);
            });

            return $order;
        });
    }

    public function close(PurchaseOrder $order): PurchaseOrder
    {
        $this->assertStatus($order, [S::Emitida, S::RecibidaParcial, S::Recibida], 'cerrar');
        $order->forceFill(['status' => S::Cerrada])->save();

        return $order;
    }

    /** Suma (+1) o resta (-1) las cantidades de la OC en los ítems de solicitud vinculados. */
    private function commitQuantities(PurchaseOrder $order, int $sign): void
    {
        $touched = [];
        foreach ($order->items()->whereNotNull('purchase_request_item_id')->get() as $item) {
            $reqItem = PurchaseRequestItem::query()->lockForUpdate()->find($item->purchase_request_item_id);
            if (! $reqItem) {
                continue;
            }
            $reqItem->forceFill([
                'qty_ordered_base' => max(0, (float) $reqItem->qty_ordered_base + $sign * (float) $item->qty_base),
            ])->save();
            $touched[$reqItem->purchase_request_id] = true;
        }
        foreach (array_keys($touched) as $requestId) {
            $this->requests->recalcStatus(PurchaseRequest::query()->findOrFail($requestId));
        }
    }

    private function decide(PurchaseOrder $order, User $user, string $status, ?string $comment): void
    {
        $approval = $order->pendingApproval()->first()
            ?? $order->approvals()->create(['requested_by' => $order->created_by, 'status' => 'pendiente']);
        $approval->update(['status' => $status, 'decided_by' => $user->id, 'decided_at' => now(), 'comment' => $comment]);
    }

    private function assertStatus(PurchaseOrder $order, array $allowed, string $action): void
    {
        if (! in_array($order->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una orden en estado \"{$order->status->label()}\".");
        }
    }
}
