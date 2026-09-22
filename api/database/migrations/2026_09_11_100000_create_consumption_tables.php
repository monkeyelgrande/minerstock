<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------- Vales de salida (VS) ----------
        Schema::create('issues', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('recipient_id')->constrained('recipients')->restrictOnDelete();
            $table->foreignId('cost_center_id')->nullable()->constrained('cost_centers')->restrictOnDelete();
            $table->date('date');
            $table->string('status', 20)->default('borrador')->index();
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('issue_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issue_id')->constrained('issues')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('unit_id')->constrained('units')->restrictOnDelete();
            $table->decimal('factor', 14, 4)->default(1);
            $table->decimal('quantity', 14, 3);
            $table->decimal('qty_base', 14, 3);
            $table->decimal('unit_cost', 14, 4)->default(0); // promedio al confirmar
            $table->string('notes', 255)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ---------- Préstamos de herramientas (PR) ----------
        Schema::create('loans', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('recipient_id')->constrained('recipients')->restrictOnDelete();
            $table->date('loaned_at');
            $table->date('expected_return_at')->nullable();
            $table->string('status', 30)->default('borrador')->index();
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('loan_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('qty_base', 14, 3);
            $table->decimal('unit_cost', 14, 4)->default(0); // promedio al confirmar
            $table->decimal('qty_returned_base', 14, 3)->default(0);
            $table->decimal('qty_damaged_base', 14, 3)->default(0);
            $table->decimal('qty_lost_base', 14, 3)->default(0);
            $table->string('notes', 255)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('loan_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->date('returned_at');
            $table->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('loan_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loan_return_id')->constrained(table: 'loan_returns', indexName: 'lri_return_fk')->cascadeOnDelete();
            $table->foreignId('loan_item_id')->constrained(table: 'loan_items', indexName: 'lri_item_fk')->restrictOnDelete();
            $table->decimal('qty_base', 14, 3);
            $table->string('condition', 20); // bueno | dañado | perdido
            $table->string('notes', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_return_items');
        Schema::dropIfExists('loan_returns');
        Schema::dropIfExists('loan_items');
        Schema::dropIfExists('loans');
        Schema::dropIfExists('issue_items');
        Schema::dropIfExists('issues');
    }
};
