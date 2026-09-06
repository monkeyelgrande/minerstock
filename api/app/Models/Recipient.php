<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['type', 'name', 'document_number', 'phone', 'cost_center_id', 'site_id', 'is_active'])]
class Recipient extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
