<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------- Planillas de viaje (PL) ----------
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('origin_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('destination_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->restrictOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('drivers')->restrictOnDelete();
            $table->string('status', 30)->default('borrador')->index();
            $table->timestamp('dispatched_at')->nullable();
            $table->foreignId('dispatched_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('shipment_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_id')->constrained('shipments')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('purchase_request_item_id')->nullable()->constrained('purchase_request_items')->nullOnDelete();
            $table->foreignId('unit_id')->constrained('units')->restrictOnDelete();
            $table->decimal('factor', 14, 4)->default(1);
            $table->decimal('quantity', 14, 3);
            $table->decimal('qty_base', 14, 3);
            $table->decimal('unit_cost', 14, 4)->default(0); // promedio al despachar
            $table->decimal('qty_received_base', 14, 3)->default(0);
            $table->string('notes', 255)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // ---------- Recepciones en destino (RM) ----------
        Schema::create('shipment_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('shipment_id')->constrained('shipments')->restrictOnDelete();
            $table->date('received_at');
            $table->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $table->string('status', 20)->default('borrador')->index();
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('shipment_receipt_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_receipt_id')->constrained(table: 'shipment_receipts', indexName: 'sri_receipt_fk')->cascadeOnDelete();
            $table->foreignId('shipment_item_id')->constrained(table: 'shipment_items', indexName: 'sri_item_fk')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('qty_received_base', 14, 3)->default(0);
            $table->decimal('qty_missing_base', 14, 3)->default(0);
            $table->decimal('qty_damaged_base', 14, 3)->default(0);
            $table->decimal('qty_extra_base', 14, 3)->default(0);
            $table->string('notes', 255)->nullable();
            $table->timestamps();
        });

        Schema::create('shipment_novelties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shipment_receipt_item_id')->constrained(table: 'shipment_receipt_items', indexName: 'sn_receipt_item_fk')->cascadeOnDelete();
            $table->string('type', 20); // faltante | dañado | sobrante
            $table->decimal('qty_base', 14, 3);
            $table->string('description', 500)->nullable();
            $table->string('status', 20)->default('abierta')->index();
            $table->text('resolution')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_novelties');
        Schema::dropIfExists('shipment_receipt_items');
        Schema::dropIfExists('shipment_receipts');
        Schema::dropIfExists('shipment_items');
        Schema::dropIfExists('shipments');
    }
};
