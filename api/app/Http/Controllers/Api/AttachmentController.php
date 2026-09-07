<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\Purchasing\AttachmentResource;
use App\Models\Attachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Adjuntos polimórficos (fotos, PDF) sobre documentos. */
class AttachmentController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'attachable_type' => ['required', Rule::in(array_keys(Attachment::TYPES))],
            'attachable_id' => ['required', 'integer'],
            'purpose' => ['nullable', 'string', 'max:40'],
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf,xlsx,xls,docx'],
        ]);

        $modelClass = Attachment::TYPES[$data['attachable_type']];
        $model = $modelClass::query()->findOrFail($data['attachable_id']);

        $file = $request->file('file');
        $path = $file->store('attachments/'.$data['attachable_type'].'/'.$model->id, 'public');

        $attachment = $model->attachments()->create([
            'purpose' => $data['purpose'] ?? null,
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime' => $file->getMimeType(),
            'size' => $file->getSize(),
            'uploaded_by' => $request->user()->id,
        ]);

        return (new AttachmentResource($attachment->load('uploader')))->response()->setStatusCode(201);
    }

    public function destroy(int $id): JsonResponse
    {
        Attachment::query()->findOrFail($id)->delete();

        return response()->json(null, 204);
    }
}
