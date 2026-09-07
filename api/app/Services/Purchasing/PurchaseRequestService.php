<?php

namespace App\Services\Purchasing;

use App\Enums\PurchaseRequestStatus as S;
use App\Exceptions\DomainException;
use App\Models\PurchaseRequest;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PurchaseRequestService
{
    /** Crea o actualiza una solicitud en borrador (o rechazada, que vuelve a borrador). */
    public function save(?PurchaseRequest $request, array $data, User $user): PurchaseRequest
    {
        if ($request && ! $request->status->isEditable()) {
            throw new DomainException('Solo se pueden editar solicitudes en borrador o rechazadas.');
        }

        return DB::transaction(function () use ($request, $data, $user) {
            $attrs = [
                'warehouse_id' => $data['warehouse_id'],
                'required_date' => $data['required_date'] ?? null,
                'priority' => $data['priority'] ?? 'normal',
                'notes' => $data['notes'] ?? null,
            ];

            if ($request) {
                $attrs['status'] = S::Borrador;
                $attrs['rejection_reason'] = null;
                $request->fill($attrs)->save();
            } else {
                $request = PurchaseRequest::query()->create($attrs + [
                    'requested_by' => $data['requested_by'] ?? $user->id,
                    'created_by' => $user->id,
                    'status' => S::Borrador,
                ]);
            }

            $products = LineItems::productsFor($data['items']);
            LineItems::sync($request->items(), $data['items'], function (array $line) use ($products) {
                $product = $products->get((int) $line['product_id'])
                    ?? throw new DomainException('Producto no encontrado.');
                $factor = LineItems::factorFor($product, (int) $line['unit_id']);

                return [
                    'product_id' => $product->id,
                    'unit_id' => (int) $line['unit_id'],
                    'factor' => $factor,
                    'quantity' => $line['quantity'],
                    'qty_base' => round((float) $line['quantity'] * $factor, 3),
                    'notes' => $line['notes'] ?? null,
                ];
            });

            return $request->refresh();
        });
    }

    public function submit(PurchaseRequest $request, User $user): PurchaseRequest
    {
        $this->assertStatus($request, [S::Borrador, S::Rechazada], 'enviar a aprobación');
        if ($request->items()->count() === 0) {
            throw new DomainException('La solicitud no tiene ítems.');
        }

        return DB::transaction(function () use ($request, $user) {
            $request->forceFill([
                'status' => S::Enviada,
                'submitted_at' => now(),
                'rejection_reason' => null,
            ])->save();
            $request->approvals()->create(['requested_by' => $user->id, 'status' => 'pendiente']);

            return $request;
        });
    }

    public function approve(PurchaseRequest $request, User $user, ?string $comment = null): PurchaseRequest
    {
        $this->assertStatus($request, [S::Enviada], 'aprobar');

        return DB::transaction(function () use ($request, $user, $comment) {
            $request->forceFill(['status' => S::Aprobada, 'approved_by' => $user->id, 'approved_at' => now()])->save();
            $this->decide($request, $user, 'aprobada', $comment);

            return $request;
        });
    }

    public function reject(PurchaseRequest $request, User $user, string $reason): PurchaseRequest
    {
        $this->assertStatus($request, [S::Enviada], 'rechazar');

        return DB::transaction(function () use ($request, $user, $reason) {
            $request->forceFill(['status' => S::Rechazada, 'rejection_reason' => $reason])->save();
            $this->decide($request, $user, 'rechazada', $reason);

            return $request;
        });
    }

    public function cancel(PurchaseRequest $request): PurchaseRequest
    {
        $this->assertStatus($request, [S::Borrador, S::Enviada, S::Rechazada, S::Aprobada], 'anular');
        if ($request->items()->where('qty_ordered_base', '>', 0)->exists()) {
            throw new DomainException('No se puede anular: ya tiene órdenes de compra asociadas.');
        }

        return DB::transaction(function () use ($request) {
            $request->forceFill(['status' => S::Anulada])->save();
            $request->pendingApproval()?->update(['status' => 'rechazada', 'decided_at' => now(), 'comment' => 'Solicitud anulada']);

            return $request;
        });
    }

    public function close(PurchaseRequest $request): PurchaseRequest
    {
        $this->assertStatus($request, [S::Aprobada, S::EnProceso, S::Atendida], 'cerrar');
        $request->forceFill(['status' => S::Cerrada])->save();

        return $request;
    }

    /** Recalcula el estado según lo ordenado (aprobada ↔ en proceso). */
    public function recalcStatus(PurchaseRequest $request): void
    {
        if (! in_array($request->status, [S::Aprobada, S::EnProceso], true)) {
            return;
        }
        $ordered = $request->items()->where('qty_ordered_base', '>', 0)->exists();
        $request->forceFill(['status' => $ordered ? S::EnProceso : S::Aprobada])->save();
    }

    private function decide(PurchaseRequest $request, User $user, string $status, ?string $comment): void
    {
        $approval = $request->pendingApproval()->first()
            ?? $request->approvals()->create(['requested_by' => $request->requested_by, 'status' => 'pendiente']);
        $approval->update(['status' => $status, 'decided_by' => $user->id, 'decided_at' => now(), 'comment' => $comment]);
    }

    private function assertStatus(PurchaseRequest $request, array $allowed, string $action): void
    {
        if (! in_array($request->status, $allowed, true)) {
            throw new DomainException("No se puede {$action} una solicitud en estado \"{$request->status->label()}\".");
        }
    }
}
