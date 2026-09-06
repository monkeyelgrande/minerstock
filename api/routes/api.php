<?php

use App\Http\Controllers\Api\Admin\RoleController;
use App\Http\Controllers\Api\Admin\SettingController;
use App\Http\Controllers\Api\Admin\UserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Catalog\CostCenterController;
use App\Http\Controllers\Api\Catalog\DriverController;
use App\Http\Controllers\Api\Catalog\ProductCategoryController;
use App\Http\Controllers\Api\Catalog\ProductController;
use App\Http\Controllers\Api\Catalog\RecipientController;
use App\Http\Controllers\Api\Catalog\SiteController;
use App\Http\Controllers\Api\Catalog\SupplierController;
use App\Http\Controllers\Api\Catalog\UnitController;
use App\Http\Controllers\Api\Catalog\VehicleController;
use App\Http\Controllers\Api\Catalog\WarehouseController;
use App\Http\Controllers\Api\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — MinerStock
|--------------------------------------------------------------------------
| Prefijo /api automático. Todo excepto health y login requiere token Sanctum.
| Los permisos se verifican con el middleware `permission:` de spatie.
*/

Route::get('/health', HealthController::class)->name('health');

Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:10,1')
    ->name('auth.login');

Route::middleware('auth:sanctum')->group(function () {
    // Sesión
    Route::get('/auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::put('/auth/profile', [AuthController::class, 'updateProfile'])->name('auth.profile');
    Route::put('/auth/password', [AuthController::class, 'changePassword'])->name('auth.password');

    // Catálogo (maestros)
    Route::prefix('catalog')->name('catalog.')->group(function () {
        $masters = [
            'sites' => [SiteController::class, 'sites'],
            'warehouses' => [WarehouseController::class, 'warehouses'],
            'units' => [UnitController::class, 'units'],
            'product-categories' => [ProductCategoryController::class, 'product_categories'],
            'products' => [ProductController::class, 'products'],
            'suppliers' => [SupplierController::class, 'suppliers'],
            'vehicles' => [VehicleController::class, 'vehicles'],
            'drivers' => [DriverController::class, 'drivers'],
            'cost-centers' => [CostCenterController::class, 'cost_centers'],
            'recipients' => [RecipientController::class, 'recipients'],
        ];

        foreach ($masters as $uri => [$controller, $perm]) {
            Route::get($uri, [$controller, 'index'])->middleware("permission:{$perm}.view")->name("{$perm}.index");
            Route::get("{$uri}/{id}", [$controller, 'show'])->middleware("permission:{$perm}.view")->name("{$perm}.show");
            Route::post($uri, [$controller, 'store'])->middleware("permission:{$perm}.create")->name("{$perm}.store");
            Route::put("{$uri}/{id}", [$controller, 'update'])->middleware("permission:{$perm}.update")->name("{$perm}.update");
            Route::delete("{$uri}/{id}", [$controller, 'destroy'])->middleware("permission:{$perm}.delete")->name("{$perm}.destroy");
        }
    });

    // Administración
    Route::prefix('admin')->name('admin.')->group(function () {
        Route::get('users', [UserController::class, 'index'])->middleware('permission:users.view')->name('users.index');
        Route::get('users/{id}', [UserController::class, 'show'])->middleware('permission:users.view')->name('users.show');
        Route::post('users', [UserController::class, 'store'])->middleware('permission:users.create')->name('users.store');
        Route::put('users/{id}', [UserController::class, 'update'])->middleware('permission:users.update')->name('users.update');
        Route::delete('users/{id}', [UserController::class, 'destroy'])->middleware('permission:users.delete')->name('users.destroy');
        Route::post('users/{id}/reset-password', [UserController::class, 'resetPassword'])->middleware('permission:users.update')->name('users.reset-password');

        Route::get('roles', [RoleController::class, 'index'])->middleware('permission:roles.view')->name('roles.index');
        Route::get('permissions', [RoleController::class, 'permissions'])->middleware('permission:roles.view')->name('permissions.index');
        Route::put('roles/{id}', [RoleController::class, 'update'])->middleware('permission:roles.update')->name('roles.update');

        Route::get('settings', [SettingController::class, 'index'])->middleware('permission:settings.view')->name('settings.index');
        Route::put('settings', [SettingController::class, 'update'])->middleware('permission:settings.update')->name('settings.update');
        Route::get('document-sequences', [SettingController::class, 'sequences'])->middleware('permission:settings.view')->name('sequences.index');
        Route::put('document-sequences/{docType}', [SettingController::class, 'updateSequence'])->middleware('permission:settings.update')->name('sequences.update');
    });
});
