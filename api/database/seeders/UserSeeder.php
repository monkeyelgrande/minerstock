<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::query()->firstOrCreate(
            ['email' => 'admin@minerstock.local'],
            ['name' => 'Administrador', 'username' => 'admin', 'password' => 'changeme', 'is_active' => true]
        );
        $admin->syncRoles(['admin']);
    }
}
