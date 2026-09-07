<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------- Facturas de proveedor (FP) ----------
        Schema::create('supplier_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->string('supplier_invoice_number', 60);
            $table->foreignId('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->restrictOnDelete();
            $table->date('issue_date');
            $table->date('due_date');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('withholding', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('paid_amount', 14, 2)->default(0);
            $table->decimal('credited_amount', 14, 2)->default(0);
            $table->string('status', 20)->default('pendiente')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->unique(['supplier_id', 'supplier_invoice_number']);
        });

        // Una factura cubre una o varias recepciones; una recepción pertenece a una sola factura.
        Schema::create('supplier_invoice_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_invoice_id')->constrained('supplier_invoices')->cascadeOnDelete();
            $table->foreignId('goods_receipt_id')->unique()->constrained('goods_receipts')->restrictOnDelete();
            $table->timestamps();
        });

        // ---------- Notas crédito (NC) ----------
        Schema::create('supplier_credit_notes', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->foreignId('supplier_return_id')->nullable()->constrained('supplier_returns')->nullOnDelete();
            $table->string('supplier_note_number', 60)->nullable();
            $table->date('date');
            $table->decimal('amount', 14, 2);
            $table->decimal('applied_amount', 14, 2)->default(0);
            $table->string('status', 20)->default('disponible')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('supplier_credit_note_applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_credit_note_id')->constrained(table: 'supplier_credit_notes', indexName: 'scna_note_fk')->cascadeOnDelete();
            $table->foreignId('supplier_invoice_id')->constrained(table: 'supplier_invoices', indexName: 'scna_invoice_fk')->restrictOnDelete();
            $table->decimal('amount', 14, 2);
            $table->foreignId('applied_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        // ---------- Pagos (PG) ----------
        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('number', 20)->unique();
            $table->foreignId('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->date('date');
            $table->string('method', 20)->default('transferencia');
            $table->string('reference', 80)->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('status', 20)->default('confirmado')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('supplier_payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_payment_id')->constrained(table: 'supplier_payments', indexName: 'spa_payment_fk')->cascadeOnDelete();
            $table->foreignId('supplier_invoice_id')->constrained(table: 'supplier_invoices', indexName: 'spa_invoice_fk')->restrictOnDelete();
            $table->decimal('amount', 14, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payment_allocations');
        Schema::dropIfExists('supplier_payments');
        Schema::dropIfExists('supplier_credit_note_applications');
        Schema::dropIfExists('supplier_credit_notes');
        Schema::dropIfExists('supplier_invoice_receipts');
        Schema::dropIfExists('supplier_invoices');
    }
};
