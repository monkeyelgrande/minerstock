<?php

namespace App\Services\Payables;

use App\Models\Supplier;
use App\Models\SupplierCreditNote;
use App\Models\SupplierInvoice;
use App\Models\SupplierPayment;
use Illuminate\Support\Collection;

/** Estado de cuenta por proveedor: facturas, pagos, notas crédito y saldos. */
class StatementService
{
    /** Resumen de todos los proveedores con movimiento (para el listado del estado de cuenta). */
    public function summary(): Collection
    {
        $invoices = SupplierInvoice::query()
            ->where('status', '!=', 'anulada')
            ->get(['supplier_id', 'total', 'paid_amount', 'credited_amount', 'due_date', 'status'])
            ->groupBy('supplier_id');

        $credits = SupplierCreditNote::query()
            ->where('status', '!=', 'anulada')
            ->get(['supplier_id', 'amount', 'applied_amount'])
            ->groupBy('supplier_id');

        $supplierIds = $invoices->keys()->merge($credits->keys())->unique();
        $suppliers = Supplier::query()->whereIn('id', $supplierIds)->get()->keyBy('id');

        return $supplierIds->map(function ($supplierId) use ($invoices, $credits, $suppliers) {
            $supplier = $suppliers[$supplierId] ?? null;
            if (! $supplier) {
                return null;
            }
            $rows = $invoices[$supplierId] ?? collect();
            $open = $rows->filter(fn ($i) => in_array($i->status->value, ['pendiente', 'parcial'], true));
            $balance = round((float) $open->sum(fn ($i) => $i->balance()), 2);
            $overdue = round((float) $open->filter(fn ($i) => $i->isOverdue())->sum(fn ($i) => $i->balance()), 2);
            $availableCredit = round((float) ($credits[$supplierId] ?? collect())->sum(fn ($n) => (float) $n->amount - (float) $n->applied_amount), 2);

            return [
                'supplier' => ['id' => $supplier->id, 'name' => $supplier->name, 'document_number' => $supplier->document_number, 'payment_terms_days' => $supplier->payment_terms_days],
                'invoices_count' => $rows->count(),
                'open_count' => $open->count(),
                'total_invoiced' => round((float) $rows->sum('total'), 2),
                'balance' => $balance,
                'overdue_balance' => $overdue,
                'available_credit' => $availableCredit,
            ];
        })->filter()->sortByDesc('balance')->values();
    }

    /** Detalle de un proveedor: facturas con saldo, pagos y notas. */
    public function forSupplier(Supplier $supplier): array
    {
        $invoices = SupplierInvoice::query()->where('supplier_id', $supplier->id)
            ->orderByDesc('issue_date')->orderByDesc('id')->limit(200)->get()
            ->map(fn (SupplierInvoice $i) => [
                'id' => $i->id,
                'number' => $i->number,
                'supplier_invoice_number' => $i->supplier_invoice_number,
                'order' => $i->purchase_order_id ? ['id' => $i->purchase_order_id, 'number' => $i->order?->number] : null,
                'issue_date' => $i->issue_date?->format('Y-m-d'),
                'due_date' => $i->due_date?->format('Y-m-d'),
                'total' => (float) $i->total,
                'paid_amount' => (float) $i->paid_amount,
                'credited_amount' => (float) $i->credited_amount,
                'balance' => $i->balance(),
                'status' => $i->status->value,
                'status_label' => $i->status->label(),
                'is_overdue' => $i->isOverdue(),
            ]);

        $payments = SupplierPayment::query()->where('supplier_id', $supplier->id)
            ->with('allocations.invoice')
            ->orderByDesc('date')->orderByDesc('id')->limit(100)->get()
            ->map(fn (SupplierPayment $p) => [
                'id' => $p->id,
                'number' => $p->number,
                'date' => $p->date?->format('Y-m-d'),
                'method' => $p->method,
                'method_label' => SupplierPayment::METHODS[$p->method] ?? $p->method,
                'reference' => $p->reference,
                'amount' => (float) $p->amount,
                'status' => $p->status,
                'invoices' => $p->allocations->map(fn ($a) => ['number' => $a->invoice?->number, 'amount' => (float) $a->amount])->values(),
            ]);

        $notes = SupplierCreditNote::query()->where('supplier_id', $supplier->id)
            ->with('supplierReturn')
            ->orderByDesc('date')->orderByDesc('id')->limit(100)->get()
            ->map(fn (SupplierCreditNote $n) => [
                'id' => $n->id,
                'number' => $n->number,
                'date' => $n->date?->format('Y-m-d'),
                'return_number' => $n->supplierReturn?->number,
                'amount' => (float) $n->amount,
                'applied_amount' => (float) $n->applied_amount,
                'available' => $n->availableAmount(),
                'status' => $n->status->value,
                'status_label' => $n->status->label(),
            ]);

        $openInvoices = $invoices->filter(fn ($i) => in_array($i['status'], ['pendiente', 'parcial'], true));

        return [
            'supplier' => [
                'id' => $supplier->id,
                'name' => $supplier->name,
                'document_number' => $supplier->document_number,
                'payment_terms_days' => $supplier->payment_terms_days,
                'contact_name' => $supplier->contact_name,
                'phone' => $supplier->phone,
                'email' => $supplier->email,
            ],
            'totals' => [
                'balance' => round((float) $openInvoices->sum('balance'), 2),
                'overdue_balance' => round((float) $openInvoices->where('is_overdue', true)->sum('balance'), 2),
                'open_count' => $openInvoices->count(),
                'available_credit' => round((float) $notes->where('status', 'disponible')->sum('available'), 2),
            ],
            'invoices' => $invoices->values(),
            'payments' => $payments->values(),
            'credit_notes' => $notes->values(),
        ];
    }
}
