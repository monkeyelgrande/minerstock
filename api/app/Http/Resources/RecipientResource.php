<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RecipientResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'name' => $this->name,
            'document_number' => $this->document_number,
            'phone' => $this->phone,
            'cost_center_id' => $this->cost_center_id,
            'cost_center' => $this->whenLoaded('costCenter', fn () => $this->costCenter ? [
                'id' => $this->costCenter->id,
                'code' => $this->costCenter->code,
                'name' => $this->costCenter->name,
            ] : null),
            'site_id' => $this->site_id,
            'site' => $this->whenLoaded('site', fn () => $this->site ? [
                'id' => $this->site->id,
                'name' => $this->site->name,
            ] : null),
            'is_active' => $this->is_active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
