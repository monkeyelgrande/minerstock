<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReviewResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'title' => $this->title,
            'brand' => $this->brand,
            'model' => $this->model,
            'rating' => $this->rating,
            'summary' => $this->summary,
            'body' => $this->when(
                $request->routeIs('reviews.show'),
                $this->body
            ),
            'pros' => $this->pros,
            'cons' => $this->cons,
            'hero_image' => $this->hero_image,
            'gallery' => $this->when(
                $request->routeIs('reviews.show'),
                $this->gallery
            ),
            'youtube_video_id' => $this->youtube_video_id,
            'is_featured' => $this->is_featured,
            'published_at' => $this->published_at?->toIso8601String(),
            'category' => new CategoryResource($this->whenLoaded('category')),
        ];
    }
}
