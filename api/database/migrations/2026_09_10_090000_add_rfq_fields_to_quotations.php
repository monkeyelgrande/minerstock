<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Flujo de solicitud de cotización (RFQ): la cotización nace sin precios,
     * se envía al proveedor y los precios se registran cuando este responde.
     */
    public function up(): void
    {
        Schema::table('quotations', function (Blueprint $table) {
            $table->timestamp('sent_at')->nullable()->after('status');
        });

        Schema::table('quotation_items', function (Blueprint $table) {
            $table->decimal('unit_price', 14, 2)->nullable()->change();
            $table->boolean('not_quoted')->default(false)->after('is_selected');
        });
    }

    public function down(): void
    {
        Schema::table('quotation_items', function (Blueprint $table) {
            $table->dropColumn('not_quoted');
            $table->decimal('unit_price', 14, 2)->nullable(false)->change();
        });
        Schema::table('quotations', function (Blueprint $table) {
            $table->dropColumn('sent_at');
        });
    }
};
