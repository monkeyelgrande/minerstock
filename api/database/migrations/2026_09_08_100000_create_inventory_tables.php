<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------- Kardex y saldos ----------
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->string('type', 40)->index();
            $table->decimal('qty_base', 14, 3); // con signo: + entrada / − salida
            $table->decimal('unit_cost', 14, 4)->default(0);
            $table->decimal('total_cost', 16, 2)->default(0);
            $table->decimal('balance_qty_after', 14, 3)->default(0);
            $table->decimal('balance_cost_after', 14, 4)->default(0);
            $table->nullableMorphs('source');
            $table->boolean('is_reversal')->default(false);
            $table->timestamp('moved_at')->index();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('notes', 255)->nullable();
            $table->timestamps();

            $table->index(['warehouse_id', 'product_id', 'moved_at']);
        });

        Schema::create('stock_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('qty', 14, 3)->default(0);
            $table->decimal('avg_cost', 14, 4)->default(0);
            $table->timestamp('last_movement_at')->nullable();
            $table->timestamps();

            $table->unique(['warehouse_id', 'product_id']);
        });

        // ---------- Recepciones de compra (RC) ----------
        Schema::create('goods_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('purchase_order_id')->constrained('purchase_orders')->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->string('supplier_remission', 60)->nullable();
            $table->date('received_at');
            $table->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $table->string('status', 20)->default('borrador')->index();
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('goods_receipt_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('goods_receipt_id')->constrained('goods_receipts')->cascadeOnDelete();
            $table->foreignId('purchase_order_item_id')->constrained('purchase_order_items')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('unit_id')->constrained('units')->restrictOnDelete();
            $table->decimal('factor', 14, 4)->default(1);
            $table->decimal('quantity', 14, 3);
            $table->decimal('qty_base', 14, 3);
            $table->decimal('unit_cost_base', 14, 4);
            $table->decimal('qty_returned_base', 14, 3)->default(0);
            $table->string('notes', 255)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ---------- Devoluciones a proveedor (DV) ----------
        Schema::create('supplier_returns', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->foreignId('goods_receipt_id')->constrained('goods_receipts')->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->date('date');
            $table->string('reason', 30)->default('defectuoso');
            $table->string('status', 20)->default('borrador')->index();
            $table->decimal('total_cost', 16, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('supplier_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_return_id')->constrained('supplier_returns')->cascadeOnDelete();
            $table->foreignId('goods_receipt_item_id')->constrained('goods_receipt_items')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('qty_base', 14, 3);
            $table->decimal('unit_cost_base', 14, 4);
            $table->string('notes', 255)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ---------- Conteos físicos (CF) y ajustes (AJ) ----------
        Schema::create('stock_counts', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->date('date');
            $table->string('status', 20)->default('en_proceso')->index();
            $table->foreignId('counted_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('adjustment_id')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('stock_count_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_count_id')->constrained('stock_counts')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('system_qty', 14, 3)->default(0);
            $table->decimal('counted_qty', 14, 3)->nullable();
            $table->string('notes', 255)->nullable();
            $table->timestamps();

            $table->unique(['stock_count_id', 'product_id']);
        });

        Schema::create('adjustments', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->date('date');
            $table->string('reason', 40)->default('correccion');
            $table->string('status', 20)->default('borrador')->index();
            $table->foreignId('stock_count_id')->nullable()->constrained('stock_counts')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('adjustment_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('adjustment_id')->constrained('adjustments')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('qty_base', 14, 3); // con signo
            $table->decimal('unit_cost', 14, 4)->nullable(); // null → costo promedio al confirmar
            $table->string('notes', 255)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('stock_counts', function (Blueprint $table) {
            $table->foreign('adjustment_id')->references('id')->on('adjustments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('stock_counts', fn (Blueprint $t) => $t->dropForeign(['adjustment_id']));
        Schema::dropIfExists('adjustment_items');
        Schema::dropIfExists('adjustments');
        Schema::dropIfExists('stock_count_items');
        Schema::dropIfExists('stock_counts');
        Schema::dropIfExists('supplier_return_items');
        Schema::dropIfExists('supplier_returns');
        Schema::dropIfExists('goods_receipt_items');
        Schema::dropIfExists('goods_receipts');
        Schema::dropIfExists('stock_balances');
        Schema::dropIfExists('stock_movements');
    }
};
