<?php

namespace App\Services\Payables;

use App\Enums\InvoiceStatus;
use App\Enums\SimpleDocStatus;
use App\Exceptions\DomainException;
use App\Models\GoodsReceipt;
use App\Models\SupplierInvoice;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class SupplierInvoiceService
{
    /**
     * Crea o actualiza una factura. Editable solo mientras no tenga pagos ni notas aplicadas.
     * Si trae recepciones, todas deben ser de la misma OC (proveedor y orden se derivan de ahí).
     */
    public function save(?SupplierInvoice $invoice, array $data, User $user): SupplierInvoice
    {
        if ($invoice) {
            if ($invoice->status === InvoiceStatus::Anulada) {
                throw new DomainException('La factura está anulada.');
            }
            if (! $invoice->isUntouched()) {
                throw new DomainException('No se puede editar una factura con pagos o notas crédito aplicadas.');
            }
        }

        return DB::transaction(function () use ($invoice, $data, $user) {
            $receiptIds = collect($data['goods_receipt_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();
            $receipts = $this->validatedReceipts($receiptIds, $invoice);

            $supplierId = $data['supplier_id'] ?? null;
            $orderId = $data['purchase_order_id'] ?? null;
            if ($receipts->isNotEmpty()) {
                $orderId = $receipts->first()->order->id;
                $supplierId = $receipts->first()->order->supplier_id;
            }
            if (! $supplierId) {
                throw new DomainException('Indica el proveedor o selecciona recepciones.');
            }

            $subtotal = round((float) $data['subtotal'], 2);
            $tax = round((float) ($data['tax'] ?? 0), 2);
            $withholding = round((float) ($data['withholding'] ?? 0), 2);
            $total = round($subtotal + $tax - $withholding, 2);
            if ($total <= 0) {
                throw new DomainException('El total a pagar debe ser mayor que cero.');
            }

            $attrs = [
                'supplier_invoice_number' => trim($data['supplier_invoice_number']),
                'supplier_id' => $supplierId,
                'purchase_order_id' => $orderId,
                'issue_date' => $data['issue_date'],
                'due_date' => $data['due_date'],
                'subtotal' => $subtotal,
                'tax' => $tax,
                'withholding' => $withholding,
                'total' => $total,
                'notes' => $data['notes'] ?? null,
            ];

            $duplicate = SupplierInvoice::query()
                ->where('supplier_id', $supplierId)
                ->where('supplier_invoice_number', $attrs['supplier_invoice_number'])
                ->when($invoice, fn ($q) => $q->where('id', '!=', $invoice->id))
                ->exists();
            if ($duplicate) {
                throw new DomainException('Ya existe una factura de este proveedor con ese número.');
            }

            if ($invoice) {
                $invoice->fill($attrs)->save();
            } else {
                $invoice = SupplierInvoice::query()->create($attrs + ['created_by' => $user->id, 'status' => InvoiceStatus::Pendiente]);
            }

            $invoice->receipts()->sync($receiptIds->all());

            return $invoice->refresh();
        });
    }

    public function cancel(SupplierInvoice $invoice): SupplierInvoice
    {
        if ($invoice->status === InvoiceStatus::Anulada) {
            throw new DomainException('La factura ya está anulada.');
        }
        if (! $invoice->isUntouched()) {
            throw new DomainException('No se puede anular una factura con pagos o notas crédito aplicadas. Anula primero esos documentos.');
        }

        return DB::transaction(function () use ($invoice) {
            $invoice->receipts()->sync([]);
            $invoice->forceFill(['status' => InvoiceStatus::Anulada])->save();

            return $invoice;
        });
    }

    /** @param  Collection<int, int>  $receiptIds */
    private function validatedReceipts(Collection $receiptIds, ?SupplierInvoice $invoice): Collection
    {
        if ($receiptIds->isEmpty()) {
            return collect();
        }

        $receipts = GoodsReceipt::query()->with('order')->whereIn('id', $receiptIds)->get();
        if ($receipts->count() !== $receiptIds->count()) {
            throw new DomainException('Alguna recepción seleccionada no existe.');
        }
        foreach ($receipts as $receipt) {
            if ($receipt->status !== SimpleDocStatus::Confirmado) {
                throw new DomainException("La recepción {$receipt->number} no está confirmada.");
            }
        }
        if ($receipts->pluck('order.id')->unique()->count() > 1) {
            throw new DomainException('Todas las recepciones deben pertenecer a la misma orden de compra.');
        }

        $taken = DB::table('supplier_invoice_receipts')
            ->whereIn('goods_receipt_id', $receiptIds)
            ->when($invoice, fn ($q) => $q->where('supplier_invoice_id', '!=', $invoice->id))
            ->exists();
        if ($taken) {
            throw new DomainException('Alguna recepción ya está asociada a otra factura.');
        }

        return $receipts;
    }
}
