<?php

namespace App\Http\Resources\Payables;

use App\Http\Resources\Purchasing\AttachmentResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupplierInvoiceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'supplier_invoice_number' => $this->supplier_invoice_number,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
                'document_number' => $this->supplier->document_number,
            ]),
            'purchase_order_id' => $this->purchase_order_id,
            'order' => $this->whenLoaded('order', fn () => $this->order ? ['id' => $this->order->id, 'number' => $this->order->number] : null),
            'issue_date' => $this->issue_date?->format('Y-m-d'),
            'due_date' => $this->due_date?->format('Y-m-d'),
            'subtotal' => (float) $this->subtotal,
            'tax' => (float) $this->tax,
            'withholding' => (float) $this->withholding,
            'total' => (float) $this->total,
            'paid_amount' => (float) $this->paid_amount,
            'credited_amount' => (float) $this->credited_amount,
            'balance' => $this->balance(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'is_overdue' => $this->isOverdue(),
            'is_editable' => $this->status->value !== 'anulada' && $this->isUntouched(),
            'notes' => $this->notes,
            'receipts' => $this->whenLoaded('receipts', fn () => $this->receipts->map(fn ($r) => [
                'id' => $r->id,
                'number' => $r->number,
                'received_at' => $r->received_at?->format('Y-m-d'),
                'supplier_remission' => $r->supplier_remission,
            ])->values()),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($a) => [
                'id' => $a->id,
                'amount' => (float) $a->amount,
                'payment' => $a->relationLoaded('payment') && $a->payment ? [
                    'id' => $a->payment->id,
                    'number' => $a->payment->number,
                    'date' => $a->payment->date?->format('Y-m-d'),
                    'method' => $a->payment->method,
                    'status' => $a->payment->status,
                ] : null,
            ])->values()),
            'credit_applications' => $this->whenLoaded('creditApplications', fn () => $this->creditApplications->map(fn ($a) => [
                'id' => $a->id,
                'amount' => (float) $a->amount,
                'note' => $a->relationLoaded('note') && $a->note ? [
                    'id' => $a->note->id,
                    'number' => $a->note->number,
                    'date' => $a->note->date?->format('Y-m-d'),
                ] : null,
            ])->values()),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
