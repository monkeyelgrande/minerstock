<?php

use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\VideoController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — monkeystechnology.com
|--------------------------------------------------------------------------
|
| Todas las rutas se prefijan automáticamente con /api por bootstrap/app.php.
| Públicas: GET para vitrina. Admin (POST/PUT/DELETE): bajo auth:sanctum.
|
*/

// Smoke test / liveness
Route::get('/health', HealthController::class)->name('health');

// Public — catalog
Route::get('/categories', [CategoryController::class, 'index'])->name('categories.index');
Route::get('/categories/{category:slug}', [CategoryController::class, 'show'])->name('categories.show');

Route::get('/reviews', [ReviewController::class, 'index'])->name('reviews.index');
Route::get('/reviews/{review:slug}', [ReviewController::class, 'show'])->name('reviews.show');

Route::get('/videos', [VideoController::class, 'index'])->name('videos.index');
Route::get('/videos/{video:youtube_id}', [VideoController::class, 'show'])->name('videos.show');

// Auth (admin) — Sanctum tokens
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', fn (Request $request) => $request->user());
    // TODO: rutas admin de reviews/categories/videos (POST/PUT/DELETE)
});
