<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $categories = Category::query()
            ->withCount(['reviews' => function ($q) {
                $q->published();
            }])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function show(Category $category)
    {
        $category->loadCount(['reviews' => function ($q) {
            $q->published();
        }]);

        return new CategoryResource($category);
    }
}
