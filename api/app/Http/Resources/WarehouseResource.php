<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WarehouseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'site_id' => $this->site_id,
            'site' => $this->whenLoaded('site', fn () => [
                'id' => $this->site->id,
                'name' => $this->site->name,
                'type' => $this->site->type,
            ]),
            'code' => $this->code,
            'name' => $this->name,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
