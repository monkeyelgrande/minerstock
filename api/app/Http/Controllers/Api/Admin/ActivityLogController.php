<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;

/** Log de actividad (spatie/laravel-activitylog): quién hizo qué y cuándo. */
class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Activity::query()->with('causer')->latest('id');

        if ($userId = $request->query('user_id')) {
            $query->where('causer_id', $userId);
        }
        if ($subject = $request->query('subject_type')) {
            // Se filtra por el nombre corto de la clase (Shipment, PurchaseOrder, ...).
            $query->where('subject_type', 'like', "%{$subject}");
        }
        if ($event = $request->query('event')) {
            $query->where('event', $event);
        }
        if ($from = $request->query('date_from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->whereDate('created_at', '<=', $to);
        }
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($w) => $w->where('description', 'like', "%{$search}%")
                ->orWhere('properties', 'like', "%{$search}%"));
        }

        $perPage = min(max((int) $request->query('per_page', 25), 1), 100);
        $page = $query->paginate($perPage)->appends($request->query());

        return response()->json([
            'data' => collect($page->items())->map(function (Activity $a) {
                $props = $a->properties ?? collect();

                return [
                    'id' => $a->id,
                    'description' => $a->description,
                    'event' => $a->event,
                    'subject_type' => $a->subject_type ? class_basename($a->subject_type) : null,
                    'subject_id' => $a->subject_id,
                    'subject_number' => $a->subject->number ?? null,
                    'causer' => $a->causer ? ['id' => $a->causer->id, 'name' => $a->causer->name] : null,
                    'changes' => [
                        'attributes' => $props['attributes'] ?? null,
                        'old' => $props['old'] ?? null,
                    ],
                    'created_at' => $a->created_at,
                ];
            }),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()],
            'subject_types' => Activity::query()->distinct()->pluck('subject_type')
                ->filter()->map(fn ($t) => class_basename($t))->unique()->sort()->values(),
        ]);
    }
}
