<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Video extends Model
{
    use HasFactory;

    protected $fillable = [
        'youtube_id',
        'title',
        'description',
        'thumbnail_url',
        'published_at',
        'view_count',
        'is_featured',
        'sort_order',
        'last_synced_at',
    ];

    protected $casts = [
        'published_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'view_count' => 'integer',
        'is_featured' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function scopeFeatured(Builder $query): Builder
    {
        return $query->where('is_featured', true);
    }

    public function getRouteKeyName(): string
    {
        return 'youtube_id';
    }
}
