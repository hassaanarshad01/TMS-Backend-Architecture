@echo off

REM ==================== CREATE DIRECTORIES ====================

mkdir backend\src\config
mkdir backend\src\controllers
mkdir backend\src\jobs
mkdir backend\src\middleware
mkdir backend\src\routes
mkdir backend\src\services
mkdir backend\src\utils
mkdir backend\src\validators

REM ==================== CONFIG ====================

type nul > backend\src\config\database.js
type nul > backend\src\config\env.js

REM ==================== CONTROLLERS ====================

type nul > backend\src\controllers\auth.controller.js
type nul > backend\src\controllers\documents.controller.js
type nul > backend\src\controllers\drivers.controller.js
type nul > backend\src\controllers\invoices.controller.js
type nul > backend\src\controllers\loads.controller.js
type nul > backend\src\controllers\notification.controller.js
type nul > backend\src\controllers\pod.controller.js
type nul > backend\src\controllers\settlement.controller.js
type nul > backend\src\controllers\shippers.controller.js
type nul > backend\src\controllers\vehicles.controller.js

REM ==================== JOBS ====================

type nul > backend\src\jobs\checkExpiringDocuments.job.js
type nul > backend\src\jobs\checkOverdueInvoices.job.js
type nul > backend\src\jobs\cleanupNotifications.job.js
type nul > backend\src\jobs\index.js

REM ==================== MIDDLEWARE ====================

type nul > backend\src\middleware\auditLog.js
type nul > backend\src\middleware\auth.js
type nul > backend\src\middleware\errorHandler.js
type nul > backend\src\middleware\rateLimit.js
type nul > backend\src\middleware\roleCheck.js
type nul > backend\src\middleware\upload.js
type nul > backend\src\middleware\validation.js

REM ==================== ROUTES ====================

type nul > backend\src\routes\auth.routes.js
type nul > backend\src\routes\documents.routes.js
type nul > backend\src\routes\drivers.routes.js
type nul > backend\src\routes\index.js
type nul > backend\src\routes\invoices.routes.js
type nul > backend\src\routes\loads.routes.js
type nul > backend\src\routes\notifications.routes.js
type nul > backend\src\routes\pod.routes.js
type nul > backend\src\routes\reports.routes.js
type nul > backend\src\routes\settlements.routes.js
type nul > backend\src\routes\shippers.routes.js
type nul > backend\src\routes\vehicles.routes.js

REM ==================== SERVICES ====================

type nul > backend\src\services\audit.service.js
type nul > backend\src\services\auth.service.js
type nul > backend\src\services\email.service.js
type nul > backend\src\services\geocoding.service.js
type nul > backend\src\services\loads.service.js
type nul > backend\src\services\notification.service.js
type nul > backend\src\services\pdf.service.js
type nul > backend\src\services\storage.service.js

REM ==================== UTILS ====================

type nul > backend\src\utils\constants.js
type nul > backend\src\utils\errors.js
type nul > backend\src\utils\formatters.js
type nul > backend\src\utils\jwt.js
type nul > backend\src\utils\logger.js
type nul > backend\src\utils\response.js

REM ==================== VALIDATORS ====================

type nul > backend\src\validators\auth.validator.js
type nul > backend\src\validators\driver.validator.js
type nul > backend\src\validators\invoice.validator.js
type nul > backend\src\validators\load.validator.js
type nul > backend\src\validators\settlement.validator.js
type nul > backend\src\validators\vehicle.validator.js

REM ==================== ROOT FILES ====================

type nul > backend\src\app.js
type nul > backend\server.js
type nul > backend\.env
type nul > backend\.env.example
type nul > backend\package.json
type nul > backend\README.md

echo Backend folder structure created successfully.
pause
