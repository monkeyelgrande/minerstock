<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Video;
use Illuminate\Http\Request;

class VideoController extends Controller
{
    public function index(Request $request)
    {
        $videos = Video::query()
            ->when($request->boolean('featured'), fn ($q) => $q->featured())
            ->orderBy('sort_order')
            ->orderByDesc('published_at')
            ->limit($request->integer('limit', 24))
            ->get();

        return VideoResource::collection($videos);
    }

    public function show(Video $video)
    {
        return new VideoResource($video);
    }
}
