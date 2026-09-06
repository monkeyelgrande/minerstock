<?php

namespace App\Models;

use App\Models\Concerns\LogsChanges;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['site_id', 'code', 'name', 'is_active'])]
class Warehouse extends Model
{
    use LogsChanges;

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_warehouse');
    }
}
