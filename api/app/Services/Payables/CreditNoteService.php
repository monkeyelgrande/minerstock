<?php

namespace App\Services\Payables;

use App\Enums\CreditNoteStatus;
use App\Exceptions\DomainException;
use App\Models\SupplierCreditNote;
use App\Models\SupplierInvoice;
use App\Models\SupplierReturn;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CreditNoteService
{
    /** Crea la nota crédito de una devolución confirmada (llamado por SupplierReturnService). */
    public function createFromReturn(SupplierReturn $return, User $user): SupplierCreditNote
    {
        return SupplierCreditNote::query()->create([
            'supplier_id' => $return->supplier_id,
            'supplier_return_id' => $return->id,
            'date' => $return->date?->format('Y-m-d') ?? now()->format('Y-m-d'),
            'amount' => (float) $return->total_cost,
            'notes' => "Generada por la devolución {$return->number}",
            'created_by' => $user->id,
            'status' => CreditNoteStatus::Disponible,
        ]);
    }

    /** Nota crédito manual (descuento del proveedor sin devolución física). */
    public function createManual(array $data, User $user): SupplierCreditNote
    {
        $amount = round((float) $data['amount'], 2);
        if ($amount <= 0) {
            throw new DomainException('El valor de la nota crédito debe ser mayor que cero.');
        }

        return SupplierCreditNote::query()->create([
            'supplier_id' => $data['supplier_id'],
            'supplier_note_number' => $data['supplier_note_number'] ?? null,
            'date' => $data['date'],
            'amount' => $amount,
            'notes' => $data['notes'] ?? null,
            'created_by' => $user->id,
            'status' => CreditNoteStatus::Disponible,
        ]);
    }

    /**
     * Aplica la nota a facturas abiertas del mismo proveedor.
     *
     * @param  array<int, array{supplier_invoice_id: int, amount: float}>  $applications
     */
    public function apply(SupplierCreditNote $note, array $applications, User $user): SupplierCreditNote
    {
        if ($note->status === CreditNoteStatus::Anulada) {
            throw new DomainException('La nota crédito está anulada.');
        }

        return DB::transaction(function () use ($note, $applications, $user) {
            $total = 0.0;
            foreach ($applications as $app) {
                $amount = round((float) $app['amount'], 2);
                if ($amount <= 0) {
                    continue;
                }
                $invoice = SupplierInvoice::query()->lockForUpdate()->findOrFail((int) $app['supplier_invoice_id']);
                if ((int) $invoice->supplier_id !== (int) $note->supplier_id) {
                    throw new DomainException("La factura {$invoice->number} no es del proveedor de la nota.");
                }
                if (! $invoice->status->isOpen()) {
                    throw new DomainException("La factura {$invoice->number} no está pendiente.");
                }
                if ($amount > $invoice->balance() + 0.009) {
                    throw new DomainException("La aplicación a la factura {$invoice->number} supera su saldo.");
                }
                $total += $amount;
                if ($total > $note->availableAmount() + 0.009) {
                    throw new DomainException('Las aplicaciones superan el saldo disponible de la nota crédito.');
                }

                $note->applications()->create([
                    'supplier_invoice_id' => $invoice->id,
                    'amount' => $amount,
                    'applied_by' => $user->id,
                ]);
                $invoice->forceFill(['credited_amount' => round((float) $invoice->credited_amount + $amount, 2)])->save();
                $invoice->recalcStatus();
            }

            if ($total <= 0) {
                throw new DomainException('Indica al menos una aplicación con valor mayor que cero.');
            }

            $note->forceFill(['applied_amount' => round((float) $note->applied_amount + $total, 2)])->save();
            $note->recalcStatus();

            return $note->refresh();
        });
    }

    /** Retira una aplicación (devuelve el saldo a la nota y a la factura). */
    public function removeApplication(SupplierCreditNote $note, int $applicationId): SupplierCreditNote
    {
        return DB::transaction(function () use ($note, $applicationId) {
            $app = $note->applications()->lockForUpdate()->findOrFail($applicationId);
            $invoice = SupplierInvoice::query()->lockForUpdate()->findOrFail($app->supplier_invoice_id);

            $invoice->forceFill(['credited_amount' => max(0, round((float) $invoice->credited_amount - (float) $app->amount, 2))])->save();
            $invoice->recalcStatus();

            $note->forceFill(['applied_amount' => max(0, round((float) $note->applied_amount - (float) $app->amount, 2))])->save();
            $app->delete();
            $note->recalcStatus();

            return $note->refresh();
        });
    }

    /** Anula la nota (solo sin aplicaciones). Si viene de una devolución, la devolución sigue confirmada. */
    public function cancel(SupplierCreditNote $note): SupplierCreditNote
    {
        if ($note->status === CreditNoteStatus::Anulada) {
            throw new DomainException('La nota crédito ya está anulada.');
        }
        if ((float) $note->applied_amount > 0) {
            throw new DomainException('No se puede anular: la nota tiene aplicaciones. Retíralas primero.');
        }
        $note->forceFill(['status' => CreditNoteStatus::Anulada])->save();

        return $note;
    }
}
