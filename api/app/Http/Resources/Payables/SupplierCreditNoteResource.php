<?php

namespace App\Http\Resources\Payables;

use App\Http\Resources\Purchasing\AttachmentResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupplierCreditNoteResource extends JsonResource
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
            'supplier_return_id' => $this->supplier_return_id,
            'return' => $this->whenLoaded('supplierReturn', fn () => $this->supplierReturn ? [
                'id' => $this->supplierReturn->id,
                'number' => $this->supplierReturn->number,
            ] : null),
            'supplier_note_number' => $this->supplier_note_number,
            'date' => $this->date?->format('Y-m-d'),
            'amount' => (float) $this->amount,
            'applied_amount' => (float) $this->applied_amount,
            'available' => $this->availableAmount(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'notes' => $this->notes,
            'applications' => $this->whenLoaded('applications', fn () => $this->applications->map(fn ($a) => [
                'id' => $a->id,
                'supplier_invoice_id' => $a->supplier_invoice_id,
                'amount' => (float) $a->amount,
                'applied_at' => $a->created_at,
                'applier' => $a->relationLoaded('applier') && $a->applier ? ['id' => $a->applier->id, 'name' => $a->applier->name] : null,
                'invoice' => $a->relationLoaded('invoice') && $a->invoice ? [
                    'id' => $a->invoice->id,
                    'number' => $a->invoice->number,
                    'supplier_invoice_number' => $a->invoice->supplier_invoice_number,
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
