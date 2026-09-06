<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('document_type', 10)->default('NIT');
            $table->string('document_number', 30)->unique();
            $table->string('name', 160);
            $table->string('contact_name', 120)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('email', 120)->nullable();
            $table->string('address', 255)->nullable();
            $table->string('city', 100)->nullable();
            $table->unsignedSmallInteger('payment_terms_days')->default(0);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('name');
        });

        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('plate', 15)->unique();
            $table->string('type', 40);
            $table->string('brand', 60)->nullable();
            $table->decimal('capacity_kg', 10, 2)->nullable();
            $table->enum('ownership', ['propio', 'tercero'])->default('propio');
            $table->string('owner_name', 120)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->string('document_number', 30)->unique();
            $table->string('name', 120);
            $table->string('phone', 40)->nullable();
            $table->string('license_number', 40)->nullable();
            $table->string('license_category', 10)->nullable();
            $table->date('license_expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drivers');
        Schema::dropIfExists('vehicles');
        Schema::dropIfExists('suppliers');
    }
};
