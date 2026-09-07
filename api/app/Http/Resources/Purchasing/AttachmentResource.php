<?php

namespace App\Http\Resources\Purchasing;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'purpose' => $this->purpose,
            'url' => $this->url(),
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => (int) $this->size,
            'is_image' => str_starts_with((string) $this->mime, 'image/'),
            'uploaded_by' => $this->whenLoaded('uploader', fn () => ['id' => $this->uploader->id, 'name' => $this->uploader->name]),
            'created_at' => $this->created_at,
        ];
    }
}
