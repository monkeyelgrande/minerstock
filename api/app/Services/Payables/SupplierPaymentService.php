<?php

namespace App\Services\Payables;

use App\Exceptions\DomainException;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class SupplierPaymentService
{
    /**
     * Registra un pago y lo aplica a facturas del proveedor.
     * La suma de las aplicaciones debe ser igual al valor del pago.
     */
    public function create(array $data, User $user): SupplierPayment
    {
        return DB::transaction(function () use ($data, $user) {
            $amount = round((float) $data['amount'], 2);
            $allocations = collect($data['allocations'])
                ->map(fn ($a) => ['supplier_invoice_id' => (int) $a['supplier_invoice_id'], 'amount' => round((float) $a['amount'], 2)])
                ->filter(fn ($a) => $a['amount'] > 0)
                ->values();

            if ($allocations->isEmpty()) {
                throw new DomainException('El pago debe aplicarse al menos a una factura.');
            }
            if ($allocations->pluck('supplier_invoice_id')->unique()->count() !== $allocations->count()) {
                throw new DomainException('Hay facturas repetidas en la aplicación del pago.');
            }
            if (abs((float) $allocations->sum('amount') - $amount) > 0.009) {
                throw new DomainException('La suma aplicada a las facturas debe ser igual al valor del pago.');
            }

            $payment = SupplierPayment::query()->create([
                'supplier_id' => $data['supplier_id'],
                'date' => $data['date'],
                'method' => $data['method'],
                'reference' => $data['reference'] ?? null,
                'amount' => $amount,
                'notes' => $data['notes'] ?? null,
                'created_by' => $user->id,
                'status' => 'confirmado',
            ]);

            foreach ($allocations as $alloc) {
                $invoice = SupplierInvoice::query()->lockForUpdate()->findOrFail($alloc['supplier_invoice_id']);
                if ((int) $invoice->supplier_id !== (int) $data['supplier_id']) {
                    throw new DomainException("La factura {$invoice->number} no es del proveedor del pago.");
                }
                if (! $invoice->status->isOpen()) {
                    throw new DomainException("La factura {$invoice->number} no está pendiente de pago.");
                }
                if ($alloc['amount'] > $invoice->balance() + 0.009) {
                    throw new DomainException("La aplicación a la factura {$invoice->number} supera su saldo.");
                }
                $payment->allocations()->create($alloc);
                $invoice->forceFill(['paid_amount' => round((float) $invoice->paid_amount + $alloc['amount'], 2)])->save();
                $invoice->recalcStatus();
            }

            return $payment;
        });
    }

    /** Anula el pago y revierte las aplicaciones en las facturas. */
    public function cancel(SupplierPayment $payment): SupplierPayment
    {
        if ($payment->status === 'anulado') {
            throw new DomainException('El pago ya está anulado.');
        }

        return DB::transaction(function () use ($payment) {
            foreach ($payment->allocations as $alloc) {
                $invoice = SupplierInvoice::query()->lockForUpdate()->findOrFail($alloc->supplier_invoice_id);
                $invoice->forceFill(['paid_amount' => max(0, round((float) $invoice->paid_amount - (float) $alloc->amount, 2))])->save();
                $invoice->recalcStatus();
            }
            $payment->forceFill(['status' => 'anulado'])->save();

            return $payment;
        });
    }
}
