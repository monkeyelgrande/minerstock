<?php

namespace App\Http\Resources\Payables;

use App\Http\Resources\Purchasing\AttachmentResource;
use App\Models\SupplierPayment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupplierPaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'supplier_id' => $this->supplier_id,
            'supplier' => $this->whenLoaded('supplier', fn () => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
                'document_number' => $this->supplier->document_number,
            ]),
            'date' => $this->date?->format('Y-m-d'),
            'method' => $this->method,
            'method_label' => SupplierPayment::METHODS[$this->method] ?? $this->method,
            'reference' => $this->reference,
            'amount' => (float) $this->amount,
            'status' => $this->status,
            'status_label' => $this->status === 'anulado' ? 'Anulado' : 'Confirmado',
            'notes' => $this->notes,
            'allocations' => $this->whenLoaded('allocations', fn () => $this->allocations->map(fn ($a) => [
                'id' => $a->id,
                'supplier_invoice_id' => $a->supplier_invoice_id,
                'amount' => (float) $a->amount,
                'invoice' => $a->relationLoaded('invoice') && $a->invoice ? [
                    'id' => $a->invoice->id,
                    'number' => $a->invoice->number,
                    'supplier_invoice_number' => $a->invoice->supplier_invoice_number,
                    'total' => (float) $a->invoice->total,
                    'balance' => $a->invoice->balance(),
                    'status' => $a->invoice->status->value,
                    'status_label' => $a->invoice->status->label(),
                ] : null,
            ])->values()),
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
            'creator' => $this->whenLoaded('creator', fn () => ['id' => $this->creator->id, 'name' => $this->creator->name]),
            'created_at' => $this->created_at,
        ];
    }
}
