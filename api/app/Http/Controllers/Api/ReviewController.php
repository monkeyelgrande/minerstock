<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReviewResource;
use App\Models\Review;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    public function index(Request $request)
    {
        $reviews = Review::query()
            ->published()
            ->with('category')
            ->when($request->filled('category'), function ($q) use ($request) {
                $q->whereHas('category', fn ($c) => $c->where('slug', $request->string('category')));
            })
            ->when($request->boolean('featured'), fn ($q) => $q->featured())
            ->orderByDesc('published_at')
            ->paginate($request->integer('per_page', 12));

        return ReviewResource::collection($reviews);
    }

    public function show(Review $review)
    {
        abort_unless($review->published_at && $review->published_at->isPast(), 404);

        $review->load('category');

        return new ReviewResource($review);
    }
}
