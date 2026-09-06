<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->string('code', 10)->unique();
            $table->string('name', 60);
            $table->boolean('allows_decimals')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('product_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->foreignId('parent_id')->nullable()->constrained('product_categories')->restrictOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('sku', 40)->unique();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->foreignId('category_id')->nullable()->constrained('product_categories')->restrictOnDelete();
            $table->foreignId('base_unit_id')->constrained('units')->restrictOnDelete();
            $table->enum('kind', ['consumible', 'retornable'])->default('consumible');
            $table->decimal('default_min_stock', 14, 3)->default(0);
            $table->string('barcode', 60)->nullable();
            $table->string('image_path')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('name');
        });

        // Unidades alternas: 1 unidad = factor unidades base
        Schema::create('product_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('unit_id')->constrained('units')->restrictOnDelete();
            $table->decimal('factor', 14, 4);
            $table->boolean('is_default_purchase')->default(false);
            $table->timestamps();

            $table->unique(['product_id', 'unit_id']);
        });

        // Parámetros de stock por bodega
        Schema::create('warehouse_product', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('min_stock', 14, 3)->default(0);
            $table->decimal('max_stock', 14, 3)->nullable();
            $table->timestamps();

            $table->unique(['warehouse_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouse_product');
        Schema::dropIfExists('product_units');
        Schema::dropIfExists('products');
        Schema::dropIfExists('product_categories');
        Schema::dropIfExists('units');
    }
};
