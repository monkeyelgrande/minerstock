<?php

use App\Http\Controllers\Api\Admin\ActivityLogController;
use App\Http\Controllers\Api\Admin\RoleController;
use App\Http\Controllers\Api\Admin\SettingController;
use App\Http\Controllers\Api\Admin\UserController;
use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Catalog\CostCenterController;
use App\Http\Controllers\Api\Catalog\DriverController;
use App\Http\Controllers\Api\Catalog\ProductCategoryController;
use App\Http\Controllers\Api\Catalog\ProductController;
use App\Http\Controllers\Api\Catalog\RecipientController;
use App\Http\Controllers\Api\Catalog\SiteController;
use App\Http\Controllers\Api\Catalog\SupplierController;
use App\Http\Controllers\Api\Catalog\UnitController;
use App\Http\Controllers\Api\Catalog\VehicleController;
use App\Http\Controllers\Api\Catalog\WarehouseController;
use App\Http\Controllers\Api\Consumption\IssueController;
use App\Http\Controllers\Api\Consumption\LoanController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\Inventory\AdjustmentController;
use App\Http\Controllers\Api\Inventory\GoodsReceiptController;
use App\Http\Controllers\Api\Inventory\StockController;
use App\Http\Controllers\Api\Inventory\StockCountController;
use App\Http\Controllers\Api\Inventory\SupplierReturnController;
use App\Http\Controllers\Api\Logistics\NoveltyController;
use App\Http\Controllers\Api\Logistics\ShipmentController;
use App\Http\Controllers\Api\Logistics\ShipmentReceiptController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\Payables\CreditNoteController;
use App\Http\Controllers\Api\Payables\StatementController;
use App\Http\Controllers\Api\Payables\SupplierInvoiceController;
use App\Http\Controllers\Api\Payables\SupplierPaymentController;
use App\Http\Controllers\Api\Purchasing\ApprovalController;
use App\Http\Controllers\Api\Purchasing\ComparisonController;
use App\Http\Controllers\Api\Purchasing\PurchaseOrderController;
use App\Http\Controllers\Api\Purchasing\PurchaseRequestController;
use App\Http\Controllers\Api\Purchasing\QuotationController;
use App\Http\Controllers\Api\Reports\ReportController;
use App\Http\Controllers\Api\SearchController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — MinerStock
|--------------------------------------------------------------------------
| Prefijo /api automático. Todo excepto health y login requiere token Sanctum.
| Los permisos se verifican con el middleware `permission:` de spatie.
*/

Route::get('/health', HealthController::class)->name('health');

Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:10,1')
    ->name('auth.login');

Route::middleware('auth:sanctum')->group(function () {
    // Sesión
    Route::get('/auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::put('/auth/profile', [AuthController::class, 'updateProfile'])->name('auth.profile');
    Route::put('/auth/password', [AuthController::class, 'changePassword'])->name('auth.password');

    Route::get('/dashboard', DashboardController::class)->name('dashboard');

    // Buscador global y notificaciones del usuario
    Route::get('/search', SearchController::class)->name('search');
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead'])->name('notifications.read');

    // Reportes
    Route::get('/reports', [ReportController::class, 'index'])->middleware('permission:reports.view')->name('reports.index');
    Route::get('/reports/{key}', [ReportController::class, 'show'])->middleware('permission:reports.view')->name('reports.show');

    // Catálogo (maestros)
    Route::prefix('catalog')->name('catalog.')->group(function () {
        $masters = [
            'sites' => [SiteController::class, 'sites'],
            'warehouses' => [WarehouseController::class, 'warehouses'],
            'units' => [UnitController::class, 'units'],
            'product-categories' => [ProductCategoryController::class, 'product_categories'],
            'products' => [ProductController::class, 'products'],
            'suppliers' => [SupplierController::class, 'suppliers'],
            'vehicles' => [VehicleController::class, 'vehicles'],
            'drivers' => [DriverController::class, 'drivers'],
            'cost-centers' => [CostCenterController::class, 'cost_centers'],
            'recipients' => [RecipientController::class, 'recipients'],
        ];

        foreach ($masters as $uri => [$controller, $perm]) {
            Route::get($uri, [$controller, 'index'])->middleware("permission:{$perm}.view")->name("{$perm}.index");
            Route::get("{$uri}/{id}", [$controller, 'show'])->middleware("permission:{$perm}.view")->name("{$perm}.show");
            Route::post($uri, [$controller, 'store'])->middleware("permission:{$perm}.create")->name("{$perm}.store");
            Route::put("{$uri}/{id}", [$controller, 'update'])->middleware("permission:{$perm}.update")->name("{$perm}.update");
            Route::delete("{$uri}/{id}", [$controller, 'destroy'])->middleware("permission:{$perm}.delete")->name("{$perm}.destroy");
        }
    });

    // Compras
    Route::prefix('purchasing')->name('purchasing.')->group(function () {
        // Solicitudes de compra
        Route::get('purchase-requests', [PurchaseRequestController::class, 'index'])->middleware('permission:purchase_requests.view');
        Route::get('purchase-requests/counts', [PurchaseRequestController::class, 'counts'])->middleware('permission:purchase_requests.view');
        Route::get('purchase-requests/pending-items', [PurchaseRequestController::class, 'pendingItems'])->middleware('permission:purchase_requests.view');
        Route::get('purchase-requests/{id}', [PurchaseRequestController::class, 'show'])->middleware('permission:purchase_requests.view');
        Route::post('purchase-requests', [PurchaseRequestController::class, 'store'])->middleware('permission:purchase_requests.create');
        Route::put('purchase-requests/{id}', [PurchaseRequestController::class, 'update'])->middleware('permission:purchase_requests.update');
        Route::post('purchase-requests/{id}/submit', [PurchaseRequestController::class, 'submit'])->middleware('permission:purchase_requests.update');
        Route::post('purchase-requests/{id}/approve', [PurchaseRequestController::class, 'approve'])->middleware('permission:purchase_requests.approve');
        Route::post('purchase-requests/{id}/reject', [PurchaseRequestController::class, 'reject'])->middleware('permission:purchase_requests.approve');
        Route::post('purchase-requests/{id}/cancel', [PurchaseRequestController::class, 'cancel'])->middleware('permission:purchase_requests.delete');
        Route::post('purchase-requests/{id}/close', [PurchaseRequestController::class, 'close'])->middleware('permission:purchase_requests.update');

        // Cotizaciones
        Route::get('quotations', [QuotationController::class, 'index'])->middleware('permission:quotations.view');
        Route::get('quotations/{id}', [QuotationController::class, 'show'])->middleware('permission:quotations.view');
        Route::post('quotations', [QuotationController::class, 'store'])->middleware('permission:quotations.create');
        Route::put('quotations/{id}', [QuotationController::class, 'update'])->middleware('permission:quotations.update');
        Route::delete('quotations/{id}', [QuotationController::class, 'destroy'])->middleware('permission:quotations.delete');
        Route::post('quotations/{id}/send', [QuotationController::class, 'send'])->middleware('permission:quotations.update');
        Route::post('quotations/{id}/respond', [QuotationController::class, 'respond'])->middleware('permission:quotations.update');
        Route::get('quotations/{id}/pdf', [QuotationController::class, 'pdf'])->middleware('permission:quotations.view');
        Route::post('quotations/{id}/receive', [QuotationController::class, 'receive'])->middleware('permission:quotations.update');
        Route::post('quotations/{id}/discard', [QuotationController::class, 'discard'])->middleware('permission:quotations.update');

        // Comparativa
        Route::get('comparison', [ComparisonController::class, 'index'])->middleware('permission:quotations.view');
        Route::post('comparison/select', [ComparisonController::class, 'select'])->middleware('permission:quotations.update');
        Route::post('comparison/generate-orders', [ComparisonController::class, 'generateOrders'])->middleware('permission:purchase_orders.create');

        // Órdenes de compra
        Route::get('purchase-orders', [PurchaseOrderController::class, 'index'])->middleware('permission:purchase_orders.view');
        Route::get('purchase-orders/counts', [PurchaseOrderController::class, 'counts'])->middleware('permission:purchase_orders.view');
        Route::get('purchase-orders/{id}', [PurchaseOrderController::class, 'show'])->middleware('permission:purchase_orders.view');
        Route::get('purchase-orders/{id}/pdf', [PurchaseOrderController::class, 'pdf'])->middleware('permission:purchase_orders.view');
        Route::post('purchase-orders', [PurchaseOrderController::class, 'store'])->middleware('permission:purchase_orders.create');
        Route::put('purchase-orders/{id}', [PurchaseOrderController::class, 'update'])->middleware('permission:purchase_orders.update');
        Route::post('purchase-orders/{id}/submit', [PurchaseOrderController::class, 'submit'])->middleware('permission:purchase_orders.update');
        Route::post('purchase-orders/{id}/approve', [PurchaseOrderController::class, 'approve'])->middleware('permission:purchase_orders.approve');
        Route::post('purchase-orders/{id}/reject', [PurchaseOrderController::class, 'reject'])->middleware('permission:purchase_orders.approve');
        Route::post('purchase-orders/{id}/reopen', [PurchaseOrderController::class, 'reopen'])->middleware('permission:purchase_orders.update');
        Route::post('purchase-orders/{id}/issue', [PurchaseOrderController::class, 'issue'])->middleware('permission:purchase_orders.issue');
        Route::post('purchase-orders/{id}/cancel', [PurchaseOrderController::class, 'cancel'])->middleware('permission:purchase_orders.delete');
        Route::post('purchase-orders/{id}/close', [PurchaseOrderController::class, 'close'])->middleware('permission:purchase_orders.update');

        // Bandeja de aprobaciones
        Route::get('approvals/inbox', [ApprovalController::class, 'inbox'])->middleware('permission:approvals.view');
        Route::get('approvals/history', [ApprovalController::class, 'history'])->middleware('permission:approvals.view');
    });

    // Inventario
    Route::prefix('inventory')->name('inventory.')->group(function () {
        // Stock y kardex
        Route::get('stock', [StockController::class, 'matrix'])->middleware('permission:stock.view');
        Route::get('stock/summary', [StockController::class, 'summary'])->middleware('permission:stock.view');
        Route::get('stock/movement-types', [StockController::class, 'movementTypes'])->middleware('permission:stock.view');
        Route::get('stock/products/{productId}/balances', [StockController::class, 'productBalances'])->middleware('permission:stock.view');
        Route::get('kardex', [StockController::class, 'kardex'])->middleware('permission:stock.view');

        // Recepciones de compra
        Route::get('goods-receipts', [GoodsReceiptController::class, 'index'])->middleware('permission:goods_receipts.view');
        Route::get('goods-receipts/counts', [GoodsReceiptController::class, 'counts'])->middleware('permission:goods_receipts.view');
        Route::get('goods-receipts/receivable-orders', [GoodsReceiptController::class, 'receivableOrders'])->middleware('permission:goods_receipts.view');
        Route::get('goods-receipts/{id}', [GoodsReceiptController::class, 'show'])->middleware('permission:goods_receipts.view');
        Route::post('goods-receipts', [GoodsReceiptController::class, 'store'])->middleware('permission:goods_receipts.create');
        Route::put('goods-receipts/{id}', [GoodsReceiptController::class, 'update'])->middleware('permission:goods_receipts.update');
        Route::post('goods-receipts/{id}/confirm', [GoodsReceiptController::class, 'confirm'])->middleware('permission:goods_receipts.update');
        Route::post('goods-receipts/{id}/cancel', [GoodsReceiptController::class, 'cancel'])->middleware('permission:goods_receipts.delete');

        // Devoluciones a proveedor
        Route::get('supplier-returns', [SupplierReturnController::class, 'index'])->middleware('permission:supplier_returns.view');
        Route::get('supplier-returns/reasons', [SupplierReturnController::class, 'reasons'])->middleware('permission:supplier_returns.view');
        Route::get('supplier-returns/{id}', [SupplierReturnController::class, 'show'])->middleware('permission:supplier_returns.view');
        Route::post('supplier-returns', [SupplierReturnController::class, 'store'])->middleware('permission:supplier_returns.create');
        Route::put('supplier-returns/{id}', [SupplierReturnController::class, 'update'])->middleware('permission:supplier_returns.update');
        Route::post('supplier-returns/{id}/confirm', [SupplierReturnController::class, 'confirm'])->middleware('permission:supplier_returns.update');
        Route::post('supplier-returns/{id}/cancel', [SupplierReturnController::class, 'cancel'])->middleware('permission:supplier_returns.delete');

        // Ajustes
        Route::get('adjustments', [AdjustmentController::class, 'index'])->middleware('permission:adjustments.view');
        Route::get('adjustments/reasons', [AdjustmentController::class, 'reasons'])->middleware('permission:adjustments.view');
        Route::get('adjustments/{id}', [AdjustmentController::class, 'show'])->middleware('permission:adjustments.view');
        Route::post('adjustments', [AdjustmentController::class, 'store'])->middleware('permission:adjustments.create');
        Route::put('adjustments/{id}', [AdjustmentController::class, 'update'])->middleware('permission:adjustments.update');
        Route::post('adjustments/{id}/confirm', [AdjustmentController::class, 'confirm'])->middleware('permission:adjustments.update');
        Route::post('adjustments/{id}/cancel', [AdjustmentController::class, 'cancel'])->middleware('permission:adjustments.delete');

        // Conteos físicos
        Route::get('stock-counts', [StockCountController::class, 'index'])->middleware('permission:stock_counts.view');
        Route::get('stock-counts/{id}', [StockCountController::class, 'show'])->middleware('permission:stock_counts.view');
        Route::post('stock-counts', [StockCountController::class, 'store'])->middleware('permission:stock_counts.create');
        Route::post('stock-counts/{id}/products', [StockCountController::class, 'addProducts'])->middleware('permission:stock_counts.update');
        Route::delete('stock-counts/{id}/products/{productId}', [StockCountController::class, 'removeProduct'])->middleware('permission:stock_counts.update');
        Route::put('stock-counts/{id}/record', [StockCountController::class, 'record'])->middleware('permission:stock_counts.update');
        Route::post('stock-counts/{id}/close', [StockCountController::class, 'close'])->middleware('permission:stock_counts.update');
        Route::post('stock-counts/{id}/cancel', [StockCountController::class, 'cancel'])->middleware('permission:stock_counts.delete');
    });

    // Logística
    Route::prefix('logistics')->name('logistics.')->group(function () {
        // Planillas de viaje
        Route::get('shipments', [ShipmentController::class, 'index'])->middleware('permission:shipments.view');
        Route::get('shipments/counts', [ShipmentController::class, 'counts'])->middleware('permission:shipments.view');
        Route::get('shipments/pending-request-items', [ShipmentController::class, 'pendingRequestItems'])->middleware('permission:shipments.view');
        Route::get('shipments/in-transit', [ShipmentController::class, 'inTransit'])->middleware('permission:shipments.view');
        Route::get('shipments/{id}', [ShipmentController::class, 'show'])->middleware('permission:shipments.view');
        Route::get('shipments/{id}/pdf', [ShipmentController::class, 'pdf'])->middleware('permission:shipments.view');
        Route::post('shipments', [ShipmentController::class, 'store'])->middleware('permission:shipments.create');
        Route::put('shipments/{id}', [ShipmentController::class, 'update'])->middleware('permission:shipments.update');
        Route::post('shipments/{id}/dispatch', [ShipmentController::class, 'dispatch'])->middleware('permission:shipments.dispatch');
        Route::post('shipments/{id}/cancel', [ShipmentController::class, 'cancel'])->middleware('permission:shipments.delete');
        Route::post('shipments/{id}/close', [ShipmentController::class, 'close'])->middleware('permission:shipments.update');

        // Recepción en destino
        Route::get('shipment-receipts', [ShipmentReceiptController::class, 'index'])->middleware('permission:shipment_receipts.view');
        Route::get('shipment-receipts/{id}', [ShipmentReceiptController::class, 'show'])->middleware('permission:shipment_receipts.view');
        Route::post('shipment-receipts', [ShipmentReceiptController::class, 'store'])->middleware('permission:shipment_receipts.create');
        Route::put('shipment-receipts/{id}', [ShipmentReceiptController::class, 'update'])->middleware('permission:shipment_receipts.update');
        Route::post('shipment-receipts/{id}/confirm', [ShipmentReceiptController::class, 'confirm'])->middleware('permission:shipment_receipts.update');
        Route::post('shipment-receipts/{id}/cancel', [ShipmentReceiptController::class, 'cancel'])->middleware('permission:shipment_receipts.delete');

        // Novedades
        Route::get('novelties', [NoveltyController::class, 'index'])->middleware('permission:novelties.view');
        Route::get('novelties/counts', [NoveltyController::class, 'counts'])->middleware('permission:novelties.view');
        Route::post('novelties/{id}/resolve', [NoveltyController::class, 'resolve'])->middleware('permission:novelties.update');
    });

    // Consumo en mina
    Route::prefix('consumption')->name('consumption.')->group(function () {
        // Vales de salida
        Route::get('issues', [IssueController::class, 'index'])->middleware('permission:issues.view');
        Route::get('issues/counts', [IssueController::class, 'counts'])->middleware('permission:issues.view');
        Route::get('issues/{id}', [IssueController::class, 'show'])->middleware('permission:issues.view');
        Route::get('issues/{id}/pdf', [IssueController::class, 'pdf'])->middleware('permission:issues.view');
        Route::post('issues', [IssueController::class, 'store'])->middleware('permission:issues.create');
        Route::put('issues/{id}', [IssueController::class, 'update'])->middleware('permission:issues.update');
        Route::post('issues/{id}/confirm', [IssueController::class, 'confirm'])->middleware('permission:issues.update');
        Route::post('issues/{id}/cancel', [IssueController::class, 'cancel'])->middleware('permission:issues.delete');

        // Préstamos de herramientas
        Route::get('loans', [LoanController::class, 'index'])->middleware('permission:loans.view');
        Route::get('loans/counts', [LoanController::class, 'counts'])->middleware('permission:loans.view');
        Route::get('loans/holdings', [LoanController::class, 'holdings'])->middleware('permission:loans.view');
        Route::get('loans/{id}', [LoanController::class, 'show'])->middleware('permission:loans.view');
        Route::get('loans/{id}/pdf', [LoanController::class, 'pdf'])->middleware('permission:loans.view');
        Route::post('loans', [LoanController::class, 'store'])->middleware('permission:loans.create');
        Route::put('loans/{id}', [LoanController::class, 'update'])->middleware('permission:loans.update');
        Route::post('loans/{id}/confirm', [LoanController::class, 'confirm'])->middleware('permission:loans.update');
        Route::post('loans/{id}/cancel', [LoanController::class, 'cancel'])->middleware('permission:loans.delete');
        Route::post('loans/{id}/returns', [LoanController::class, 'storeReturn'])->middleware('permission:loans.update');
    });

    // Cuentas por pagar
    Route::prefix('payables')->name('payables.')->group(function () {
        // Facturas de proveedor
        Route::get('invoices', [SupplierInvoiceController::class, 'index'])->middleware('permission:supplier_invoices.view');
        Route::get('invoices/counts', [SupplierInvoiceController::class, 'counts'])->middleware('permission:supplier_invoices.view');
        Route::get('invoices/invoiceable-receipts', [SupplierInvoiceController::class, 'invoiceableReceipts'])->middleware('permission:supplier_invoices.view');
        Route::get('invoices/{id}', [SupplierInvoiceController::class, 'show'])->middleware('permission:supplier_invoices.view');
        Route::post('invoices', [SupplierInvoiceController::class, 'store'])->middleware('permission:supplier_invoices.create');
        Route::put('invoices/{id}', [SupplierInvoiceController::class, 'update'])->middleware('permission:supplier_invoices.update');
        Route::post('invoices/{id}/cancel', [SupplierInvoiceController::class, 'cancel'])->middleware('permission:supplier_invoices.delete');

        // Pagos
        Route::get('payments', [SupplierPaymentController::class, 'index'])->middleware('permission:supplier_payments.view');
        Route::get('payments/methods', [SupplierPaymentController::class, 'methods'])->middleware('permission:supplier_payments.view');
        Route::get('payments/{id}', [SupplierPaymentController::class, 'show'])->middleware('permission:supplier_payments.view');
        Route::post('payments', [SupplierPaymentController::class, 'store'])->middleware('permission:supplier_payments.create');
        Route::post('payments/{id}/cancel', [SupplierPaymentController::class, 'cancel'])->middleware('permission:supplier_payments.delete');

        // Notas crédito
        Route::get('credit-notes', [CreditNoteController::class, 'index'])->middleware('permission:supplier_credit_notes.view');
        Route::get('credit-notes/{id}', [CreditNoteController::class, 'show'])->middleware('permission:supplier_credit_notes.view');
        Route::post('credit-notes', [CreditNoteController::class, 'store'])->middleware('permission:supplier_credit_notes.create');
        Route::post('credit-notes/{id}/apply', [CreditNoteController::class, 'apply'])->middleware('permission:supplier_credit_notes.update');
        Route::delete('credit-notes/{id}/applications/{applicationId}', [CreditNoteController::class, 'removeApplication'])->middleware('permission:supplier_credit_notes.update');
        Route::post('credit-notes/{id}/cancel', [CreditNoteController::class, 'cancel'])->middleware('permission:supplier_credit_notes.delete');

        // Estado de cuenta
        Route::get('statement', [StatementController::class, 'index'])->middleware('permission:supplier_invoices.view');
        Route::get('statement/{supplierId}', [StatementController::class, 'show'])->middleware('permission:supplier_invoices.view');
    });

    // Adjuntos
    Route::post('attachments', [AttachmentController::class, 'store'])->name('attachments.store');
    Route::delete('attachments/{id}', [AttachmentController::class, 'destroy'])->name('attachments.destroy');

    // Administración
    Route::prefix('admin')->name('admin.')->group(function () {
        Route::get('users', [UserController::class, 'index'])->middleware('permission:users.view')->name('users.index');
        Route::get('users/{id}', [UserController::class, 'show'])->middleware('permission:users.view')->name('users.show');
        Route::post('users', [UserController::class, 'store'])->middleware('permission:users.create')->name('users.store');
        Route::put('users/{id}', [UserController::class, 'update'])->middleware('permission:users.update')->name('users.update');
        Route::delete('users/{id}', [UserController::class, 'destroy'])->middleware('permission:users.delete')->name('users.destroy');
        Route::post('users/{id}/reset-password', [UserController::class, 'resetPassword'])->middleware('permission:users.update')->name('users.reset-password');

        Route::get('roles', [RoleController::class, 'index'])->middleware('permission:roles.view')->name('roles.index');
        Route::get('permissions', [RoleController::class, 'permissions'])->middleware('permission:roles.view')->name('permissions.index');
        Route::put('roles/{id}', [RoleController::class, 'update'])->middleware('permission:roles.update')->name('roles.update');

        Route::get('activity', [ActivityLogController::class, 'index'])->middleware('permission:activity_log.view')->name('activity.index');

        Route::get('settings', [SettingController::class, 'index'])->middleware('permission:settings.view')->name('settings.index');
        Route::put('settings', [SettingController::class, 'update'])->middleware('permission:settings.update')->name('settings.update');
        Route::get('document-sequences', [SettingController::class, 'sequences'])->middleware('permission:settings.view')->name('sequences.index');
        Route::put('document-sequences/{docType}', [SettingController::class, 'updateSequence'])->middleware('permission:settings.update')->name('sequences.update');
    });
});
