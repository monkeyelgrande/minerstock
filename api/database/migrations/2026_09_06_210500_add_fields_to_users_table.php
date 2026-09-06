<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 40)->nullable()->unique()->after('name');
            $table->string('phone', 40)->nullable()->after('email');
            $table->boolean('is_active')->default(true)->after('password');
            $table->foreignId('default_warehouse_id')->nullable()->after('is_active')
                ->constrained('warehouses')->nullOnDelete();
            $table->timestamp('last_login_at')->nullable()->after('remember_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('default_warehouse_id');
            $table->dropColumn(['username', 'phone', 'is_active', 'last_login_at']);
        });
    }
};
