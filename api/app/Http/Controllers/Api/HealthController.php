<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $dbOk = false;
        try {
            DB::connection()->getPdo();
            $dbOk = true;
        } catch (\Throwable $e) {
            // dejamos $dbOk en false
        }

        return response()->json([
            'status' => $dbOk ? 'ok' : 'degraded',
            'service' => config('app.name'),
            'env' => config('app.env'),
            'time' => now()->toIso8601String(),
            'checks' => [
                'database' => $dbOk,
            ],
        ]);
    }
}
