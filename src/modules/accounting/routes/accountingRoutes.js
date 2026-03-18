import express from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { bankStatementUpload } from "../../../middleware/bankStatementUpload.js";
import { beneficiaryImportUpload } from "../../../middleware/beneficiaryImportUpload.js";
import { transactionInvoiceUpload } from "../../../middleware/transactionInvoiceUpload.js";
import { AccountingController } from "../controllers/AccountingController.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Dashboard
router.get("/dashboard", AccountingController.getDashboard);

// Beneficiaries
router.get("/beneficiaries", AccountingController.getBeneficiaries);
router.get("/api/beneficiaries", AccountingController.getBeneficiariesAPI);
router.post("/beneficiaries", AccountingController.createBeneficiary);
router.get("/beneficiaries/:id", AccountingController.getBeneficiaryById);
router.put("/beneficiaries/:id", AccountingController.updateBeneficiary);
router.delete("/beneficiaries/:id", AccountingController.deleteBeneficiary);

// Beneficiary Import
router.post("/beneficiaries/import/preview", beneficiaryImportUpload, AccountingController.previewBeneficiaryImport);
router.post("/beneficiaries/import/execute", AccountingController.importBeneficiaries);

// Remitters
router.get("/remitters", AccountingController.getRemitters);
router.get("/api/remitters", AccountingController.getRemittersAPI);
router.post("/remitters", AccountingController.createRemitter);
router.get("/remitters/:id", AccountingController.getRemitterById);
router.put("/remitters/:id", AccountingController.updateRemitter);
router.delete("/remitters/:id", AccountingController.deleteRemitter);

// Remitter Import
router.post("/remitters/import/preview", beneficiaryImportUpload, AccountingController.previewRemitterImport);
router.post("/remitters/import/execute", AccountingController.importRemitters);

// Transactions
router.get("/transactions", AccountingController.getTransactions);
router.get("/missing-mandatory-invoices", AccountingController.getMissingMandatoryInvoicesPage);
router.get("/api/bank-accounts", AccountingController.getBankAccountsAPI);
router.get("/api/transactions/batch/:batchId", AccountingController.getTransactionsByBatchId);
router.get("/api/transactions/incomplete", AccountingController.getIncompleteTransactions);
router.get("/api/transactions/missing-invoices/count", AccountingController.getMissingMandatoryInvoicesCount);
router.get("/api/transactions/missing-invoices", AccountingController.getTransactionsWithMissingMandatoryInvoices);
router.get("/api/transactions/recent-imports", AccountingController.getRecentImports);
router.delete("/api/transactions/batch/:batchId", AccountingController.deleteImportBatch);
router.get("/api/transactions/csv", AccountingController.downloadTransactionsCSV);
router.get("/transactions/:id", AccountingController.getTransactionById);
router.put("/transactions/:id", AccountingController.updateTransaction);

// Transaction Invoice Upload
router.post(
  "/transactions/:id/invoice",
  (req, res, next) => {
    transactionInvoiceUpload(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, error: "File too large. Maximum size is 10MB." });
        }
        if (err.message.includes("Only PDF, images, and office documents are allowed")) {
          return res.status(400).json({ success: false, error: "Invalid file type. Only PDF, images, and office documents are allowed." });
        }
        return res.status(400).json({ success: false, error: "File upload error: " + err.message });
      }
      next();
    });
  },
  AccountingController.uploadTransactionInvoice,
);
router.delete("/transactions/:id/invoice", AccountingController.deleteTransactionInvoice);

// Bank Statement Import
router.post("/transactions/import/preview", bankStatementUpload, AccountingController.previewBankStatementImport);
router.post("/transactions/import/execute", AccountingController.importBankStatement);

// Reports
router.get("/reports", AccountingController.getReports);
router.post("/reports/download-invoices", AccountingController.downloadCategoryInvoices);

// Invoice Groups API Routes (must come before page route)
router.post("/invoice-groups", AccountingController.createInvoiceGroup);
router.get("/invoice-groups/statistics", AccountingController.getInvoiceStatistics);
router.get("/invoice-groups/list", AccountingController.getInvoiceGroups);
router.get("/invoice-groups/:invoiceId", AccountingController.getInvoiceGroupById);
router.post("/invoice-groups/add-transaction", AccountingController.addTransactionToInvoice);
router.post("/invoice-groups/remove-transaction", AccountingController.removeTransactionFromInvoice);
router.post(
  "/invoice-groups/:invoiceId/upload",
  (req, res, next) => {
    transactionInvoiceUpload(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, error: "File too large. Maximum size is 10MB." });
        }
        if (err.message.includes("Only PDF, images, and office documents are allowed")) {
          return res.status(400).json({ success: false, error: "Invalid file type. Only PDF, images, and office documents are allowed." });
        }
        return res.status(400).json({ success: false, error: "File upload error: " + err.message });
      }
      next();
    });
  },
  AccountingController.uploadInvoiceGroupFile,
);
router.delete("/invoice-groups/:invoiceId/delete-invoice", AccountingController.deleteInvoiceGroupFile);
router.post("/invoice-groups/recalculate-amounts", AccountingController.recalculateInvoiceGroupAmounts);
router.put("/invoice-groups/:invoiceId/update", AccountingController.updateInvoiceGroup);
router.post("/invoice-groups/:invoiceId/mark-uploaded", AccountingController.markInvoiceAsUploaded);

// Invoice Groups Page (must come after API routes)
router.get("/invoice-groups", AccountingController.getInvoiceGroupsPage);

// Categories
router.get("/categories", AccountingController.getCategories);
router.post("/categories", AccountingController.createCategory);
router.get("/categories/:id", AccountingController.getCategoryById);
router.put("/categories/:id", AccountingController.updateCategory);
router.delete("/categories/:id", AccountingController.deleteCategory);

// Bank Accounts
router.get("/bank-accounts", AccountingController.getBankAccounts);
router.post("/bank-accounts", AccountingController.createBankAccount);
router.get("/bank-accounts/:id", AccountingController.getBankAccountById);
router.put("/bank-accounts/:id", AccountingController.updateBankAccount);
router.delete("/bank-accounts/:id", AccountingController.deleteBankAccount);

// Import Logs
router.get("/import-logs", AccountingController.getImportLogs);
router.get("/api/import-logs/:id", AccountingController.getImportLogDetails);

// API Endpoints
router.post("/api/auto-match", AccountingController.autoMatchTransactions);

// Wallet Accounting Routes
router.get("/wallet-accounting", AccountingController.getWalletAccountingDashboard);
router.post("/api/wallet/sync-range", AccountingController.syncWalletData);
router.post("/api/wallet/sync-date", AccountingController.syncSingleDate);
router.get("/api/wallet/reconciliation", AccountingController.getWalletReconciliationReport);
router.get("/api/wallet/summary", AccountingController.getWalletDashboardSummary);
router.get("/api/wallet/adjustments", AccountingController.getWalletAdjustments);
router.post("/api/wallet/adjustments", AccountingController.createWalletAdjustment);
router.delete("/api/wallet/adjustments/:id", AccountingController.deleteWalletAdjustment);
router.get("/api/wallet/download-csv", AccountingController.downloadWalletReconciliationCSV);
router.post("/api/wallet/opening-balance", AccountingController.setManualOpeningBalance);

// Wallet Recharges Monitoring
router.get("/wallet-recharges", AccountingController.getWalletRecharges);
router.get("/api/wallet-recharges", AccountingController.getWalletRechargesAPI);
router.get("/api/wallet-recharges/summary", AccountingController.getWalletRechargesSummary);

export default router;
