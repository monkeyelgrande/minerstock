<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    use HasFactory;

    protected $fillable = [
        'category_id',
        'slug',
        'title',
        'brand',
        'model',
        'rating',
        'summary',
        'body',
        'pros',
        'cons',
        'hero_image',
        'gallery',
        'youtube_video_id',
        'published_at',
        'is_featured',
    ];

    protected $casts = [
        'rating' => 'float',
        'pros' => 'array',
        'cons' => 'array',
        'gallery' => 'array',
        'published_at' => 'datetime',
        'is_featured' => 'boolean',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->whereNotNull('published_at')
                     ->where('published_at', '<=', now());
    }

    public function scopeFeatured(Builder $query): Builder
    {
        return $query->where('is_featured', true);
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }
}
