<?php

namespace App\Models\Concerns;

use App\Models\Approval;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;

trait HasApprovals
{
    public function approvals(): MorphMany
    {
        return $this->morphMany(Approval::class, 'approvable')->latest('id');
    }

    public function pendingApproval(): MorphOne
    {
        return $this->morphOne(Approval::class, 'approvable')->where('status', 'pendiente');
    }
}
