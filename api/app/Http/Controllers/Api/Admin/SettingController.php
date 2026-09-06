<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\DocumentSequence;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Setting::query()->pluck('value', 'key')]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company' => ['sometimes', 'array'],
            'company.name' => ['required_with:company', 'string', 'max:160'],
            'company.document_number' => ['nullable', 'string', 'max:30'],
            'company.address' => ['nullable', 'string', 'max:255'],
            'company.phone' => ['nullable', 'string', 'max:40'],
            'company.email' => ['nullable', 'email', 'max:120'],
            'default_tax_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
        ]);

        foreach ($data as $key => $value) {
            Setting::set($key, $value);
        }

        return response()->json(['data' => Setting::query()->pluck('value', 'key')]);
    }

    public function sequences(): JsonResponse
    {
        return response()->json(['data' => DocumentSequence::query()->orderBy('id')->get()]);
    }

    public function updateSequence(Request $request, string $docType): JsonResponse
    {
        $seq = DocumentSequence::query()->where('doc_type', $docType)->firstOrFail();
        $data = $request->validate([
            'prefix' => ['required', 'string', 'max:10'],
            'next_number' => ['required', 'integer', 'min:'.$seq->next_number],
            'padding' => ['required', 'integer', 'min:3', 'max:8'],
        ]);
        $seq->fill($data)->save();

        return response()->json(['data' => $seq]);
    }
}
