import archiver from "archiver";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import xlsx from "xlsx";
import { hasModulePermission } from "../../../middleware/rbac.js";
import { buildSEO } from "../../../utils/seo.js";
import { AccountingCategoryModel } from "../models/AccountingCategoryModel.js";
import { BankAccountModel } from "../models/BankAccountModel.js";
import { BeneficiaryModel } from "../models/BeneficiaryModel.js";
import { ImportLogModel } from "../models/ImportLogModel.js";
import { InvoiceGroupModel } from "../models/InvoiceGroupModel.js";
import { RemitterModel } from "../models/RemitterModel.js";
import { TransactionModel } from "../models/TransactionModel.js";
import { BankStatementParser } from "../services/BankStatementParser.js";
import { IFSCService } from "../services/IFSCService.js";
import { WalletAccountingModel } from "../models/WalletAccountingModel.js";
import { opsPool } from "../../../db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AccountingController {
  // Check if user has accounting access
  static async checkAccountingAccess(user, subModule = null, permission = "read") {
    if (user.role === "admin") {
      return true;
    }

    if (subModule) {
      return await hasModulePermission(user, "accounting", subModule, permission);
    }

    try {
      const { UserPermissionsModel } = await import("../../../models/UserPermissionsModel.js");
      const result = await UserPermissionsModel.getUserPermissions(user.id);

      if (result.success && result.permissions && result.permissions.accounting) {
        return Object.keys(result.permissions.accounting).length > 0;
      }
    } catch (error) {
      console.error("Error checking accounting access:", error);
    }

    return false;
  }

  // Dashboard
  static async getDashboard(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "dashboard", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access the Accounting Dashboard.",
          error: { status: 403 },
          user: req.user,
        });
      }

      // Get date range from query parameters or default to last 7 days
      const today = new Date();
      let startDate = req.query.start_date;
      let endDate = req.query.end_date;

      // Default to last 7 days if no dates provided
      if (!startDate || !endDate) {
        endDate = today.toISOString().split("T")[0];
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        startDate = sevenDaysAgo.toISOString().split("T")[0];
      }

      // Get bank accounts
      const bankAccounts = await BankAccountModel.getAllAccounts();

      // Get summary
      const summary = await TransactionModel.getTransactionSummary({
        start_date: startDate,
        end_date: endDate,
      });

      // Get category-wise breakdown
      const categoryStats = await TransactionModel.getCategoryWiseSummary(startDate, endDate);

      // Get top beneficiaries
      const topBeneficiaries = await TransactionModel.getBeneficiaryWiseSummary(startDate, endDate);

      // Get monthly trends for chart (last 24 months, ignoring filters)
      const monthlyTrendsResult = await TransactionModel.getMonthlyTrends();
      const monthlyTrends = monthlyTrendsResult.rows || [];

      const seo = buildSEO("Accounting Dashboard", "Financial overview and analytics");

      res.render("pages/ops/accounting/dashboard", {
        seo,
        pageKey: "accounting/dashboard",
        user: req.user,
        bankAccounts: bankAccounts.rows || [],
        summary: summary.summary || {},
        categoryStats: categoryStats.rows || [],
        topBeneficiaries: topBeneficiaries.rows || [],
        monthlyTrends: monthlyTrends,
        startDate,
        endDate,
      });
    } catch (error) {
      console.error("Error loading accounting dashboard:", error);
      res.status(500).send("Error loading dashboard");
    }
  }

  // Beneficiaries Management
  static async getBeneficiaries(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Beneficiaries.",
          error: { status: 403 },
          user: req.user,
        });
      }

      // Extract filters from query string
      const filters = {
        search: req.query.search || "",
        category: req.query.category || "",
        status: req.query.status || "",
      };

      const beneficiaries = await BeneficiaryModel.getAllBeneficiaries(false, filters);
      const categories = await AccountingCategoryModel.getAllCategories();

      const seo = buildSEO("Beneficiaries", "Manage payment beneficiaries");

      res.render("pages/ops/accounting/beneficiaries", {
        seo,
        pageKey: "accounting/beneficiaries",
        user: req.user,
        beneficiaries: beneficiaries.rows || [],
        categories: categories.rows || [],
        filters,
      });
    } catch (error) {
      console.error("Error loading beneficiaries:", error);
      res.status(500).send("Error loading beneficiaries");
    }
  }

  // Transactions / Bank Statements
  static async getTransactions(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Transactions.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const { bank_account_id, start_date, end_date, category_id, beneficiary_id, remitter_id, is_matched, page = 1, limit = 25, search } = req.query;

      // Parse pagination parameters
      const currentPage = parseInt(page) || 1;
      const entriesPerPage = parseInt(limit) || 25;
      const offset = (currentPage - 1) * entriesPerPage;

      // Parse is_matched to boolean or undefined
      let isMatchedFilter;
      if (is_matched === "true") {
        isMatchedFilter = true;
      } else if (is_matched === "false") {
        isMatchedFilter = false;
      }
      // If is_matched is empty string or undefined, leave isMatchedFilter as undefined

      // Only apply default date filters if NOT filtering by beneficiary or remitter
      // This allows viewing all transactions for a specific beneficiary/remitter
      const filters = {
        bank_account_id,
        category_id,
        beneficiary_id,
        remitter_id,
        is_matched: isMatchedFilter,
        search: search || null,
        limit: entriesPerPage,
        offset: offset,
      };

      // Apply date filters: use provided dates, or default to current month only if not filtering by beneficiary/remitter
      if (start_date) {
        filters.start_date = start_date;
      } else if (!beneficiary_id && !remitter_id) {
        filters.start_date = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      }

      if (end_date) {
        filters.end_date = end_date;
      } else if (!beneficiary_id && !remitter_id) {
        filters.end_date = new Date().toISOString().split("T")[0];
      }

      const transactions = await TransactionModel.getTransactions(filters);

      // Get summary for all filtered transactions (not just current page)
      const summaryFilters = {
        bank_account_id: filters.bank_account_id,
        start_date: filters.start_date,
        end_date: filters.end_date,
        category_id: filters.category_id,
        beneficiary_id: filters.beneficiary_id,
        remitter_id: filters.remitter_id,
        is_matched: filters.is_matched,
        search: filters.search,
      };
      const summaryResult = await TransactionModel.getTransactionSummary(summaryFilters);
      const summary = summaryResult.summary || {
        total_transactions: 0,
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        matched_count: 0,
        unmatched_count: 0,
      };

      const bankAccounts = await BankAccountModel.getAllAccounts();
      const beneficiaries = await BeneficiaryModel.getAllBeneficiaries();
      const remitters = await RemitterModel.getAllRemitters();
      const categories = await AccountingCategoryModel.getAllCategories();

      const seo = buildSEO("Transactions", "View and manage bank transactions");

      // Calculate pagination info
      const totalRecords = transactions.totalCount || 0;
      const totalPages = Math.ceil(totalRecords / entriesPerPage);
      const startRecord = totalRecords > 0 ? offset + 1 : 0;
      const endRecord = Math.min(offset + entriesPerPage, totalRecords);

      res.render("pages/ops/accounting/transactions", {
        seo,
        pageKey: "accounting/transactions",
        user: req.user,
        transactions: transactions.rows || [],
        summary: summary,
        bankAccounts: bankAccounts.rows || [],
        beneficiaries: beneficiaries.rows || [],
        remitters: remitters.rows || [],
        categories: categories.rows || [],
        filters: {
          bank_account_id,
          start_date: filters.start_date || "",
          end_date: filters.end_date || "",
          category_id,
          beneficiary_id,
          remitter_id,
          is_matched,
          limit: entriesPerPage,
        },
        pagination: {
          currentPage,
          totalPages,
          totalRecords,
          startRecord,
          endRecord,
          entriesPerPage,
        },
      });
    } catch (error) {
      console.error("Error loading transactions:", error);
      res.status(500).send("Error loading transactions");
    }
  }

  // Get Missing Mandatory Invoices Page
  static async getMissingMandatoryInvoicesPage(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Missing Mandatory Invoices.",
          error: { status: 403 },
          user: req.user,
        });
      }

      res.render("pages/ops/accounting/missing-mandatory-invoices", {
        user: req.user,
        seo: {
          title: "Missing Mandatory Invoices - Accounting",
          description: "Manage transactions that require invoices but don't have them uploaded",
        },
        pageKey: "ops/accounting/missing-mandatory-invoices",
      });
    } catch (error) {
      console.error("Error in getMissingMandatoryInvoicesPage:", error);
      res.status(500).render("pages/ops/500", {
        error: error.message,
        user: req.user,
      });
    }
  }

  // API: Bank accounts for filters
  static async getBankAccountsAPI(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const bankAccounts = await BankAccountModel.getAllAccounts();
      if (!bankAccounts.success) {
        return res.status(500).json({ success: false, error: bankAccounts.error });
      }
      return res.json({ success: true, bankAccounts: bankAccounts.rows });
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      return res.status(500).json({ success: false, error: "Error fetching bank accounts" });
    }
  }

  // Reports
  static async getReports(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "reports", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Accounting Reports.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const today = new Date();
      const { report_type = "summary", start_date = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0], end_date = today.toISOString().split("T")[0], bank_account_id, export_format = "html", download_invoices } = req.query;

      let reportData = {};

      if (report_type === "comprehensive") {
        // Get all transactions with full details for comprehensive report
        reportData = await TransactionModel.getTransactions({
          start_date,
          end_date,
          bank_account_id,
          limit: 10000, // Large limit for comprehensive reports
          include_invoice: true,
        });
      } else if (report_type === "monthly_summary") {
        // Get month-wise summary data
        reportData = await TransactionModel.getMonthlySummary(start_date, end_date, bank_account_id);
      } else if (report_type === "tax_filing") {
        // Get tax filing specific data
        const summary = await TransactionModel.getTransactionSummary({ start_date, end_date, bank_account_id });
        const categories = await TransactionModel.getCategoryWiseSummary(start_date, end_date, bank_account_id);
        reportData = {
          ...summary.summary,
          categories: categories.rows || [],
        };
      } else if (report_type === "audit_trail") {
        // Get audit trail with all transaction details and metadata
        reportData = await TransactionModel.getTransactions({
          start_date,
          end_date,
          bank_account_id,
          limit: 10000,
          include_audit_info: true,
        });
      } else if (report_type === "summary") {
        reportData = await TransactionModel.getTransactionSummary({ start_date, end_date, bank_account_id });
      } else if (report_type === "category") {
        reportData = await TransactionModel.getCategoryWiseSummary(start_date, end_date, bank_account_id);
      } else if (report_type === "beneficiary") {
        reportData = await TransactionModel.getBeneficiaryWiseSummary(start_date, end_date, bank_account_id);
      } else if (report_type === "trends") {
        reportData = await TransactionModel.getDailyTrends(start_date, end_date, bank_account_id);
      }

      // Handle invoice zip download
      if (download_invoices === "true") {
        return AccountingController.downloadInvoiceZip(req, res, reportData, { start_date, end_date });
      }

      // Handle export formats
      if (export_format === "pdf") {
        return AccountingController.exportReportPDF(req, res, report_type, reportData, { start_date, end_date });
      } else if (export_format === "excel") {
        return AccountingController.exportReportExcel(req, res, report_type, reportData, { start_date, end_date });
      } else if (export_format === "csv") {
        return AccountingController.exportReportCSV(req, res, report_type, reportData, { start_date, end_date });
      }

      const bankAccounts = await BankAccountModel.getAllAccounts();

      const seo = buildSEO("Accounting Reports", "Financial reports and analytics");

      res.render("pages/ops/accounting/reports", {
        seo,
        pageKey: "accounting/reports",
        user: req.user,
        reportType: report_type,
        reportData: reportData.rows || reportData.summary || reportData || {},
        bankAccounts: bankAccounts.rows || [],
        startDate: start_date,
        endDate: end_date,
        bankAccountId: bank_account_id,
        exportFormat: export_format,
      });
    } catch (error) {
      console.error("Error loading reports:", error);
      res.status(500).send("Error loading reports");
    }
  }

  // Export Report as PDF
  static async exportReportPDF(req, res, reportType, reportData, { start_date, end_date }) {
    try {
      // Extract the actual data array from the response object
      let transactions = [];
      if (reportData && reportData.success && reportData.rows) {
        transactions = reportData.rows;
      } else if (Array.isArray(reportData)) {
        transactions = reportData;
      } else if (reportData && reportData.summary) {
        // For summary report, create a single-row summary representation
        transactions = [reportData.summary];
      }

      // Create PDF document in landscape for better table layout
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margins: {
          top: 50,
          bottom: 50,
          left: 40,
          right: 40,
        },
      });

      // Collect PDF data
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);

        const fileName = `accounting_report_${reportType}_${start_date}_to_${end_date}.pdf`;

        // Set proper headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader("Cache-Control", "no-cache");

        // Send the PDF buffer
        res.send(pdfBuffer);
      });

      // Add header
      doc.fontSize(20).text("Accounting Report", { align: "center" });
      doc.fontSize(12).text(`Report Type: ${reportType}`, { align: "center" });
      doc.text(`Date Range: ${start_date} to ${end_date}`, { align: "center" });
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: "center" });

      // Add line separator (landscape width) - fixed direction
      const lineY = doc.y + 20;
      doc.moveTo(40, lineY).lineTo(760, lineY).stroke();
      doc.moveDown(2);

      if (reportType === "comprehensive" && Array.isArray(transactions) && transactions.length > 0) {
        // Calculate totals
        const totalDebit = transactions.reduce((sum, t) => sum + (parseFloat(t.debit_amount) || 0), 0);
        const totalCredit = transactions.reduce((sum, t) => sum + (parseFloat(t.credit_amount) || 0), 0);
        const netBalance = totalCredit - totalDebit;

        // Add summary section
        doc.fontSize(14).text("Summary", { underline: true });
        doc.moveDown(1);

        const summaryY = doc.y;
        const summaryWidth = 170; // Wider for landscape
        const summaryHeight = 60;

        // Total Debit
        doc.rect(40, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Total Debit", 50, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`Rs. ${Math.round(totalDebit).toLocaleString("en-IN")}`, 50, summaryY + 25);

        // Total Credit
        doc.rect(210, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Total Credit", 220, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`Rs. ${Math.round(totalCredit).toLocaleString("en-IN")}`, 220, summaryY + 25);

        // Net Balance
        doc.rect(380, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Net Balance", 390, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`Rs. ${Math.round(netBalance).toLocaleString("en-IN")}`, 390, summaryY + 25);

        // Total Transactions
        doc.rect(550, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Total Transactions", 560, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`${transactions.length}`, 560, summaryY + 25);

        doc.font("Helvetica").moveDown(3);

        // Add transactions table
        doc.fontSize(14).font("Helvetica").text("Transactions", 40, doc.y, { underline: true });
        doc.moveDown(1);

        // Table headers with compact landscape layout
        const tableTop = doc.y;
        const colWidths = [45, 55, 45, 105, 95, 75, 105, 65, 65, 65, 35]; // Adjusted widths including transaction ID
        const colX = [40, 85, 140, 185, 290, 385, 460, 565, 630, 695, 760];

        doc.fontSize(8).font("Helvetica-Bold");
        doc.text("Txn ID", colX[0], tableTop);
        doc.text("Date", colX[1], tableTop);
        doc.text("Bank", colX[2], tableTop);
        doc.text("Description", colX[3], tableTop);
        doc.text("Beneficiary/Remitter", colX[4], tableTop);
        doc.text("Category", colX[5], tableTop);
        doc.text("Narration", colX[6], tableTop);
        doc.text("Debit", colX[7], tableTop);
        doc.text("Credit", colX[8], tableTop);
        doc.text("Balance", colX[9], tableTop);
        doc.text("Invoice", colX[10], tableTop);

        // Draw header line
        doc
          .moveTo(40, tableTop + 15)
          .lineTo(780, tableTop + 15)
          .stroke();

        let currentY = tableTop + 20;
        doc.font("Helvetica").fontSize(7);

        transactions.forEach((transaction, index) => {
          // Check if we need a new page (landscape height)
          if (currentY > 450) {
            doc.addPage();
            currentY = 50;
          }

          const debitAmount = parseFloat(transaction.debit_amount) || 0;
          const creditAmount = parseFloat(transaction.credit_amount) || 0;
          const balance = parseFloat(transaction.balance) || 0;

          // Helper function to wrap text
          const wrapText = (text, maxWidth, maxLines = 2) => {
            if (!text || text === "-") return ["-"];
            const words = text.split(" ");
            const lines = [];
            let currentLine = "";

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const testWidth = doc.widthOfString(testLine);

              if (testWidth <= maxWidth && lines.length < maxLines) {
                currentLine = testLine;
              } else {
                if (currentLine) {
                  lines.push(currentLine);
                  currentLine = word;
                } else {
                  lines.push(word.substring(0, Math.floor(maxWidth / 8))); // Approximate character width
                  currentLine = "";
                }
              }
            }

            if (currentLine) {
              lines.push(currentLine);
            }

            return lines.slice(0, maxLines);
          };

          // Transaction ID
          doc.text(transaction.id.toString(), colX[0], currentY);

          // Date
          doc.text(new Date(transaction.transaction_date).toLocaleDateString(), colX[1], currentY);

          // Source Bank
          const sourceBank = transaction.bank_account_name ? transaction.bank_account_name.split(" ")[0] : "-";
          doc.text(sourceBank, colX[2], currentY);

          // Description with wrapping
          const descriptionLines = wrapText(transaction.description || "-", colWidths[3]);
          descriptionLines.forEach((line, i) => {
            doc.text(line, colX[3], currentY + i * 10);
          });

          // Beneficiary/Remitter with wrapping
          const beneficiaryLines = wrapText(transaction.beneficiary_name || transaction.remitter_name || "-", colWidths[4]);
          beneficiaryLines.forEach((line, i) => {
            doc.text(line, colX[4], currentY + i * 10);
          });

          // Category
          const categoryLines = wrapText(transaction.category_name || "-", colWidths[5]);
          categoryLines.forEach((line, i) => {
            doc.text(line, colX[5], currentY + i * 10);
          });

          // Narration with wrapping
          const narrationLines = wrapText(transaction.narration || "-", colWidths[6]);
          narrationLines.forEach((line, i) => {
            doc.text(line, colX[6], currentY + i * 10);
          });

          // Amounts - use Indian lakh format
          const formatAmount = (amount) => {
            const rounded = Math.round(amount);
            return rounded.toLocaleString("en-IN"); // Use Indian formatting for lakh format
          };

          doc.text(debitAmount > 0 ? `Rs. ${formatAmount(debitAmount)}` : "-", colX[7], currentY);
          doc.text(creditAmount > 0 ? `Rs. ${formatAmount(creditAmount)}` : "-", colX[8], currentY);
          doc.text(`Rs. ${formatAmount(balance)}`, colX[9], currentY);
          doc.text(transaction.invoice_url ? "Yes" : "No", colX[10], currentY);

          // Calculate row height based on max lines used
          const maxLines = Math.max(descriptionLines.length, beneficiaryLines.length, narrationLines.length, 1);
          const rowHeight = maxLines * 10 + 5;

          // Draw row line
          doc
            .moveTo(40, currentY + rowHeight)
            .lineTo(780, currentY + rowHeight)
            .stroke();

          currentY += rowHeight + 5;
        });

        // Draw table border only if there are transactions and content
        if (transactions.length > 0 && currentY > tableTop + 20) {
          doc.rect(40, tableTop, 740, currentY - tableTop - 5).stroke();
        }
      } else if (reportType === "summary" && transactions.length > 0) {
        // Handle summary report - display summary statistics
        const summary = transactions[0];

        doc.fontSize(14).font("Helvetica").text("Summary Report", { underline: true });
        doc.moveDown(1);

        // Summary statistics in boxes (similar to comprehensive)
        const summaryY = doc.y;
        const summaryWidth = 170;
        const summaryHeight = 60;

        // Total Debit
        doc.rect(40, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Total Debit", 50, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`Rs. ${Math.round(parseFloat(summary.total_debit) || 0).toLocaleString("en-IN")}`, 50, summaryY + 25);

        // Total Credit
        doc.rect(210, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Total Credit", 220, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`Rs. ${Math.round(parseFloat(summary.total_credit) || 0).toLocaleString("en-IN")}`, 220, summaryY + 25);

        // Net Balance
        doc.rect(380, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Net Balance", 390, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`Rs. ${Math.round(parseFloat(summary.net_balance) || 0).toLocaleString("en-IN")}`, 390, summaryY + 25);

        // Total Transactions
        doc.rect(550, summaryY, summaryWidth, summaryHeight).stroke();
        doc.fontSize(10).text("Total Transactions", 560, summaryY + 10);
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .text(`${summary.total_transactions || 0}`, 560, summaryY + 25);

        doc.moveDown(2);

        // Additional statistics
        const additionalY = doc.y;
        const additionalWidth = 150;
        const additionalHeight = 50;

        if (summary.matched_count !== undefined) {
          // Matched Transactions
          doc.rect(40, additionalY, additionalWidth, additionalHeight).stroke();
          doc.fontSize(10).text("Matched", 50, additionalY + 10);
          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .text(`${summary.matched_count || 0}`, 50, additionalY + 25);

          // Unmatched Transactions
          doc.rect(200, additionalY, additionalWidth, additionalHeight).stroke();
          doc.fontSize(10).text("Unmatched", 210, additionalY + 10);
          doc
            .fontSize(12)
            .font("Helvetica-Bold")
            .text(`${summary.unmatched_count || 0}`, 210, additionalY + 25);
        }
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error("Error exporting PDF:", error);
      res.status(500).send("Error exporting PDF");
    }
  }

  // Export Report as Excel
  static async exportReportExcel(req, res, reportType, reportData, { start_date, end_date }) {
    try {
      const XLSX = xlsx;

      let worksheetData = [];

      // Extract the actual data array from the response object (same as PDF export)
      let transactions = [];
      if (reportData && reportData.success && reportData.rows) {
        transactions = reportData.rows;
      } else if (Array.isArray(reportData)) {
        transactions = reportData;
      }

      if (reportType === "comprehensive" && Array.isArray(transactions) && transactions.length > 0) {
        // Prepare comprehensive transaction data
        worksheetData = transactions.map((transaction) => ({
          "Transaction ID": transaction.id,
          Date: new Date(transaction.transaction_date).toLocaleDateString(),
          "Source Bank": transaction.bank_account_name ? transaction.bank_account_name.split(" ")[0] : "-",
          Description: transaction.description,
          "Beneficiary/Remitter": transaction.beneficiary_name || transaction.remitter_name || "-",
          Category: transaction.category_name || "-",
          Narration: transaction.narration || "-",
          "Debit Amount": parseFloat(transaction.debit_amount) || 0,
          "Credit Amount": parseFloat(transaction.credit_amount) || 0,
          Balance: parseFloat(transaction.balance) || 0,
          Invoice: transaction.invoice_url ? "Yes" : "No",
        }));
      } else if (reportType === "monthly_summary" && Array.isArray(transactions)) {
        worksheetData = transactions.map((month) => ({
          Month: new Date(month.month + "-01").toLocaleDateString("en-US", { year: "numeric", month: "long" }),
          Transactions: month.transaction_count,
          "Total Debit": parseFloat(month.total_debit) || 0,
          "Total Credit": parseFloat(month.total_credit) || 0,
          "Net Balance": parseFloat((month.total_credit || 0) - (month.total_debit || 0)),
        }));
      } else if (reportType === "tax_filing" && reportData.categories) {
        worksheetData = reportData.categories.map((cat) => ({
          Category: cat.category_name,
          Amount: parseFloat(cat.total_debit) || 0,
          "Tax Deductible (80%)": Math.round((cat.total_debit || 0) * 0.8),
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);

      // Set column widths for better readability
      const colWidths = [
        { wch: 12 }, // Transaction ID
        { wch: 12 }, // Date
        { wch: 12 }, // Source Bank
        { wch: 35 }, // Description
        { wch: 25 }, // Beneficiary/Remitter
        { wch: 20 }, // Category
        { wch: 30 }, // Narration
        { wch: 15 }, // Debit Amount
        { wch: 15 }, // Credit Amount
        { wch: 15 }, // Balance
        { wch: 10 }, // Invoice
      ];
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

      const fileName = `accounting_report_${reportType}_${start_date}_to_${end_date}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting Excel:", error);
      res.status(500).send("Error exporting Excel");
    }
  }

  // Export Report as CSV
  static async exportReportCSV(req, res, reportType, reportData, { start_date, end_date }) {
    try {
      let csvData = [];

      // Extract the actual data array from the response object (same as PDF export)
      let transactions = [];
      if (reportData && reportData.success && reportData.rows) {
        transactions = reportData.rows;
      } else if (Array.isArray(reportData)) {
        transactions = reportData;
      }

      if (reportType === "comprehensive" && Array.isArray(transactions) && transactions.length > 0) {
        // CSV headers
        csvData.push(["Transaction ID", "Date", "Source Bank", "Description", "Beneficiary/Remitter", "Category", "Narration", "Debit Amount", "Credit Amount", "Balance", "Invoice"]);

        // CSV rows
        transactions.forEach((transaction) => {
          const sourceBank = transaction.bank_account_name ? transaction.bank_account_name.split(" ")[0] : "-";
          csvData.push([transaction.id, new Date(transaction.transaction_date).toLocaleDateString(), sourceBank, transaction.description, transaction.beneficiary_name || transaction.remitter_name || "-", transaction.category_name || "-", transaction.narration || "-", parseFloat(transaction.debit_amount) || 0, parseFloat(transaction.credit_amount) || 0, parseFloat(transaction.balance) || 0, transaction.invoice_url ? "Yes" : "No"]);
        });
      } else if (reportType === "monthly_summary" && Array.isArray(transactions)) {
        csvData.push(["Month", "Transactions", "Total Debit", "Total Credit", "Net Balance"]);

        transactions.forEach((month) => {
          csvData.push([new Date(month.month + "-01").toLocaleDateString("en-US", { year: "numeric", month: "long" }), month.transaction_count, parseFloat(month.total_debit) || 0, parseFloat(month.total_credit) || 0, parseFloat((month.total_credit || 0) - (month.total_debit || 0))]);
        });
      }

      // Convert to CSV string
      const csvString = csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

      const fileName = `accounting_report_${reportType}_${start_date}_to_${end_date}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(csvString);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).send("Error exporting CSV");
    }
  }

  // Download Invoice Zip
  static async downloadInvoiceZip(req, res, reportData, { start_date, end_date }) {
    try {
      // Extract transactions from report data
      let transactions = [];
      if (reportData && reportData.success && reportData.rows) {
        transactions = reportData.rows;
      } else if (Array.isArray(reportData)) {
        transactions = reportData;
      } else if (reportData.rows) {
        transactions = reportData.rows;
      }

      // Filter transactions that have invoices
      const transactionsWithInvoices = transactions.filter((t) => t.invoice_url && t.invoice_url.trim() !== "");

      if (transactionsWithInvoices.length === 0) {
        return res.status(404).json({ success: false, error: "No invoices found for the selected period" });
      }

      // Set response headers for zip download
      const fileName = `invoices_${start_date}_to_${end_date}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

      // Create zip archive
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Add each invoice file to the zip with reference naming
      for (const transaction of transactionsWithInvoices) {
        const invoicePath = path.join(process.cwd(), "public", transaction.invoice_url);

        // Check if file exists
        if (fs.existsSync(invoicePath)) {
          // Create reference filename: TxnID_Date_Amount_Beneficiary_OriginalName
          const txnId = transaction.id;
          const date = new Date(transaction.transaction_date).toISOString().split("T")[0];
          const amount = Math.round(parseFloat(transaction.debit_amount) || parseFloat(transaction.credit_amount) || 0);
          const beneficiary = (transaction.beneficiary_name || transaction.remitter_name || "Unknown").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
          const originalName = path.basename(transaction.invoice_url);
          const extension = path.extname(originalName);

          const referenceName = `Txn${txnId}_${date}_Rs${amount}_${beneficiary}${extension}`;

          // Add file to zip with reference name
          archive.file(invoicePath, { name: referenceName });
        }
      }

      // Finalize the archive
      await archive.finalize();
    } catch (error) {
      console.error("Error downloading invoice zip:", error);
      res.status(500).json({ success: false, error: "Error creating invoice zip file" });
    }
  }

  // Download Invoices for Category
  static async downloadCategoryInvoices(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "reports", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date, end_date, category_id } = req.body;

      // Get transactions with invoices for the category
      const transactions = await TransactionModel.getTransactionsWithInvoices({
        start_date,
        end_date,
        category_id,
      });

      if (!transactions.rows || transactions.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No invoices found for this category" });
      }

      // For now, return list of invoice URLs
      // In production, you would create a ZIP file with all invoices
      const invoiceUrls = transactions.rows
        .filter((t) => t.invoice_url)
        .map((t) => ({
          id: t.id,
          description: t.description,
          amount: t.debit_amount || t.credit_amount,
          invoice_url: t.invoice_url,
        }));

      res.json({
        success: true,
        invoices: invoiceUrls,
        count: invoiceUrls.length,
      });
    } catch (error) {
      console.error("Error downloading invoices:", error);
      res.status(500).json({ success: false, error: "Error downloading invoices" });
    }
  }

  // Invoice Groups Page
  static async getInvoiceGroupsPage(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/403", {
          user: req.user,
          seo: buildSEO("Access Denied", "You don't have permission to access this page"),
          pageKey: "403",
        });
      }

      const seo = buildSEO("Invoice Groups", "Group multiple transactions under single invoices for better tracking and management");
      const pageKey = "invoice-groups";

      res.render("pages/ops/accounting/invoice-groups", {
        user: req.user,
        seo,
        pageKey,
      });
    } catch (error) {
      console.error("Error loading invoice groups page:", error);
      res.status(500).render("pages/ops/500", {
        user: req.user,
        seo: buildSEO("Server Error", "An error occurred while loading the page"),
        pageKey: "500",
      });
    }
  }

  // Invoice Group Management
  static async createInvoiceGroup(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const invoiceData = {
        ...req.body,
        created_by: req.user.id,
      };

      const result = await InvoiceGroupModel.createInvoiceGroup(invoiceData);

      if (result.success) {
        res.json({
          success: true,
          message: "Invoice group created successfully",
          invoiceId: result.invoiceId,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating invoice group:", error);
      res.status(500).json({ success: false, error: "Error creating invoice group" });
    }
  }

  static async getInvoiceGroups(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const filters = {
        status: req.query.status,
        beneficiary_id: req.query.beneficiary_id,
        remitter_id: req.query.remitter_id,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
      };

      const result = await InvoiceGroupModel.getInvoiceGroups(filters);

      if (result.success) {
        res.json({ success: true, invoices: result.rows });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching invoice groups:", error);
      res.status(500).json({ success: false, error: "Error fetching invoice groups" });
    }
  }

  static async getInvoiceGroupById(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId } = req.params;
      const result = await InvoiceGroupModel.getInvoiceGroupById(invoiceId);

      if (result.success) {
        if (result.invoice) {
          // Get associated transactions
          const transactionsResult = await InvoiceGroupModel.getInvoiceTransactions(invoiceId);
          res.json({
            success: true,
            invoiceGroup: result.invoice,
            transactions: transactionsResult.success ? transactionsResult.rows : [],
          });
        } else {
          res.status(404).json({ success: false, error: "Invoice group not found" });
        }
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching invoice group:", error);
      res.status(500).json({ success: false, error: "Error fetching invoice group" });
    }
  }

  static async addTransactionToInvoice(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId, transactionId, amount } = req.body;

      if (!invoiceId || !transactionId || !amount) {
        return res.status(400).json({
          success: false,
          error: "Invoice ID, Transaction ID, and amount are required",
        });
      }

      const result = await InvoiceGroupModel.addTransactionToInvoice(invoiceId, transactionId, amount);

      if (result.success) {
        res.json({
          success: true,
          message: "Transaction added to invoice successfully",
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding transaction to invoice:", error);
      res.status(500).json({ success: false, error: "Error adding transaction to invoice" });
    }
  }

  static async removeTransactionFromInvoice(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId, transactionId } = req.body;

      if (!invoiceId || !transactionId) {
        return res.status(400).json({
          success: false,
          error: "Invoice ID and Transaction ID are required",
        });
      }

      const result = await InvoiceGroupModel.removeTransactionFromInvoice(invoiceId, transactionId);

      if (result.success) {
        res.json({
          success: true,
          message: "Transaction removed from invoice successfully",
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error removing transaction from invoice:", error);
      res.status(500).json({ success: false, error: "Error removing transaction from invoice" });
    }
  }

  static async markInvoiceAsUploaded(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId } = req.params;

      const result = await InvoiceGroupModel.markInvoiceTransactionsAsUploaded(invoiceId);

      if (result.success) {
        res.json({
          success: true,
          message: `Marked ${result.affectedRows} transactions as having uploaded invoices`,
          affectedRows: result.affectedRows,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error marking invoice as uploaded:", error);
      res.status(500).json({ success: false, error: "Error marking invoice as uploaded" });
    }
  }

  // API: Upload Invoice File for Invoice Group
  static async uploadInvoiceGroupFile(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      // Generate public URL for the invoice
      const invoiceUrl = `/uploads/accounting/invoices/${req.file.filename}`;

      // Update all transactions in the invoice group with the same invoice URL
      const result = await InvoiceGroupModel.updateInvoiceGroupTransactions(invoiceId, invoiceUrl);

      if (result.success) {
        res.json({
          success: true,
          message: `Invoice uploaded successfully for ${result.affectedRows} transactions`,
          invoice_url: invoiceUrl,
          filename: req.file.filename,
          affectedRows: result.affectedRows,
        });
      } else {
        // Delete uploaded file if database update fails
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      // Delete uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Error uploading invoice group file:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteInvoiceGroupFile(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId } = req.params;

      // Get the invoice group to find the file path
      const invoiceResult = await InvoiceGroupModel.getInvoiceGroupById(invoiceId);
      if (!invoiceResult.success || !invoiceResult.invoice) {
        return res.status(404).json({ success: false, error: "Invoice group not found" });
      }

      const invoice = invoiceResult.invoice;

      // Delete the physical file if it exists
      if (invoice.invoice_url) {
        const fs = await import("fs");
        const path = await import("path");

        // Extract file path from URL
        const fileName = path.basename(invoice.invoice_url);
        const filePath = path.join(process.cwd(), "public", "uploads", "accounting", "invoices", fileName);

        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted invoice file: ${filePath}`);
          }
        } catch (fileError) {
          console.warn(`Warning: Could not delete physical file ${filePath}:`, fileError.message);
          // Continue with database update even if file deletion fails
        }
      }

      // Clear the invoice_url from the invoice group
      const result = await InvoiceGroupModel.clearInvoiceGroupFile(invoiceId);

      if (result.success) {
        res.json({
          success: true,
          message: "Invoice deleted successfully",
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting invoice group file:", error);
      res.status(500).json({ success: false, error: "Error deleting invoice group file" });
    }
  }

  static async recalculateInvoiceGroupAmounts(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const result = await InvoiceGroupModel.recalculateAllInvoiceGroupAmounts();

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          affectedRows: result.affectedRows,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error recalculating invoice group amounts:", error);
      res.status(500).json({ success: false, error: "Error recalculating invoice group amounts" });
    }
  }

  static async updateInvoiceGroup(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { invoiceId } = req.params;
      const { invoice_number, invoice_date, due_date, description, beneficiary_id, remitter_id, total_amount } = req.body;

      // Validate required fields
      if (!invoice_number || !invoice_date) {
        return res.status(400).json({
          success: false,
          error: "Invoice number and invoice date are required",
        });
      }

      const result = await InvoiceGroupModel.updateInvoiceGroup(invoiceId, {
        invoice_number,
        invoice_date,
        due_date: due_date || null,
        description: description || null,
        beneficiary_id: beneficiary_id || null,
        remitter_id: remitter_id || null,
        total_amount: total_amount || 0,
      });

      if (result.success) {
        res.json({
          success: true,
          message: "Invoice group updated successfully",
          invoiceGroup: result.invoiceGroup,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating invoice group:", error);
      res.status(500).json({ success: false, error: "Error updating invoice group" });
    }
  }

  static async getBeneficiariesAPI(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const filters = {
        search: req.query.search || "",
        category: req.query.category || "",
        status: req.query.status || "",
      };

      const result = await BeneficiaryModel.getAllBeneficiaries(false, filters);

      if (result.success) {
        res.json({
          success: true,
          beneficiaries: result.rows,
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching beneficiaries:", error);
      res.status(500).json({ success: false, error: "Error fetching beneficiaries" });
    }
  }

  static async getRemittersAPI(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const filters = {
        search: req.query.search || "",
        status: req.query.status || "",
      };

      const result = await RemitterModel.getAllRemitters(false, filters);

      if (result.success) {
        res.json({
          success: true,
          remitters: result.rows,
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching remitters:", error);
      res.status(500).json({ success: false, error: "Error fetching remitters" });
    }
  }

  static async getInvoiceStatistics(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const result = await InvoiceGroupModel.getInvoiceStatistics();

      if (result.success) {
        res.json({ success: true, statistics: result.stats });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching invoice statistics:", error);
      res.status(500).json({ success: false, error: "Error fetching invoice statistics" });
    }
  }

  // API: Create Beneficiary
  static async createBeneficiary(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const result = await BeneficiaryModel.createBeneficiary(req.body);

      if (result.success) {
        res.json({ success: true, message: "Beneficiary created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating beneficiary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Update Beneficiary
  static async updateBeneficiary(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await BeneficiaryModel.updateBeneficiary(id, req.body);

      if (result.success) {
        res.json({ success: true, message: "Beneficiary updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating beneficiary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete Beneficiary
  static async deleteBeneficiary(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "admin");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await BeneficiaryModel.deleteBeneficiary(id);

      if (result.success) {
        res.json({ success: true, message: "Beneficiary deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting beneficiary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Beneficiary by ID
  static async getBeneficiaryById(req, res) {
    try {
      const { id } = req.params;
      const result = await BeneficiaryModel.getBeneficiaryById(id);

      if (result.success) {
        res.json({ success: true, beneficiary: result.beneficiary });
      } else {
        res.status(404).json({ success: false, error: "Beneficiary not found" });
      }
    } catch (error) {
      console.error("Error fetching beneficiary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Transaction by ID
  static async getTransactionById(req, res) {
    try {
      const { id } = req.params;
      const result = await TransactionModel.getTransactionById(id);

      if (result.success) {
        res.json({ success: true, transaction: result.transaction });
      } else {
        res.status(404).json({ success: false, error: "Transaction not found" });
      }
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Update Transaction
  static async updateTransaction(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await TransactionModel.updateTransaction(id, req.body);

      if (result.success) {
        res.json({ success: true, message: "Transaction updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Transactions by Import Batch ID
  static async getTransactionsByBatchId(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { batchId } = req.params;
      const result = await TransactionModel.getTransactionsByBatchId(batchId);

      if (result.success) {
        res.json({ success: true, transactions: result.transactions });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching transactions by batch ID:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Incomplete Transactions
  static async getIncompleteTransactions(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { bank_account_id, start_date, end_date, limit } = req.query;
      const filters = {
        bank_account_id,
        start_date,
        end_date,
        limit,
      };

      const result = await TransactionModel.getIncompleteTransactions(filters);

      if (result.success) {
        res.json({ success: true, transactions: result.transactions });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching incomplete transactions:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Missing Mandatory Invoices Count
  static async getMissingMandatoryInvoicesCount(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { bank_account_id, start_date, end_date, beneficiary_id } = req.query;
      const filters = {
        bank_account_id,
        start_date,
        end_date,
        beneficiary_id,
      };

      const result = await TransactionModel.getMissingMandatoryInvoicesCount(filters);

      if (result.success) {
        res.json({ success: true, count: result.count });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error counting missing mandatory invoices:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Transactions with Missing Mandatory Invoices
  static async getTransactionsWithMissingMandatoryInvoices(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { bank_account_id, start_date, end_date, beneficiary_id, search, limit } = req.query;
      const filters = {
        bank_account_id,
        start_date,
        end_date,
        beneficiary_id,
        search,
        limit,
      };

      const result = await TransactionModel.getTransactionsWithMissingMandatoryInvoices(filters);

      if (result.success) {
        res.json({ success: true, transactions: result.transactions });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching transactions with missing mandatory invoices:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Recent Imports
  static async getRecentImports(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { limit } = req.query;
      const result = await TransactionModel.getRecentImports(parseInt(limit, 10) || 5);

      if (result.success) {
        res.json({ success: true, imports: result.imports });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching recent imports:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete Import Batch
  static async deleteImportBatch(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { batchId } = req.params;
      const result = await TransactionModel.deleteTransactionsByBatchId(batchId, req.user.id);

      if (result.success) {
        res.json({
          success: true,
          message: `Deleted ${result.deletedCount} transactions from import`,
          deletedCount: result.deletedCount,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting import batch:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Upload Invoice for Transaction
  static async uploadTransactionInvoice(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;

      if (!req.file) {
        console.log("No file uploaded for transaction:", id);
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      console.log("Uploading file for transaction:", id, {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      // Generate public URL for the invoice
      const invoiceUrl = `/uploads/accounting/invoices/${req.file.filename}`;

      // Update transaction with invoice URL
      const result = await TransactionModel.updateTransaction(id, { invoice_url: invoiceUrl });

      if (result.success) {
        console.log("Invoice uploaded successfully for transaction:", id);
        res.json({
          success: true,
          message: "Invoice uploaded successfully",
          invoice_url: invoiceUrl,
          filename: req.file.filename,
        });
      } else {
        console.log("Database update failed for transaction:", id, result.error);
        // Delete uploaded file if database update fails
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      // Delete uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Error uploading invoice:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete Transaction Invoice
  static async deleteTransactionInvoice(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;

      // Get current transaction to find file
      const txnResult = await TransactionModel.getTransactionById(id);
      if (txnResult.success && txnResult.transaction && txnResult.transaction.invoice_url) {
        const invoiceUrl = txnResult.transaction.invoice_url;

        // Extract file path from URL and construct the full path
        const fileName = path.basename(invoiceUrl);
        const filePath = path.join(process.cwd(), "public", "uploads", "accounting", "invoices", fileName);

        // Delete file if exists
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (fileError) {
            console.error("Error deleting file:", fileError);
          }
        }
      }

      // Update transaction to remove invoice URL
      const result = await TransactionModel.updateTransaction(id, { invoice_url: null });

      if (result.success) {
        res.json({ success: true, message: "Invoice deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Auto-match transactions
  static async autoMatchTransactions(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { bank_account_id } = req.body;
      const result = await TransactionModel.autoMatchTransactions(bank_account_id);

      if (result.success) {
        res.json({ success: true, message: `Matched ${result.matched} transactions`, matched: result.matched });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error auto-matching transactions:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Categories Management
  static async getCategories(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "categories", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Categories.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const categories = await AccountingCategoryModel.getAllCategories();
      const categoryStats = await AccountingCategoryModel.getCategoryStats();

      const seo = buildSEO("Expense Categories", "Manage accounting categories");

      res.render("pages/ops/accounting/categories", {
        seo,
        pageKey: "accounting/categories",
        user: req.user,
        categories: categories.rows || [],
        categoryStats: categoryStats.rows || [],
      });
    } catch (error) {
      console.error("Error loading categories:", error);
      res.status(500).send("Error loading categories");
    }
  }

  // API: Create Category
  static async createCategory(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "categories", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const result = await AccountingCategoryModel.createCategory(req.body);

      if (result.success) {
        res.json({ success: true, message: "Category created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Update Category
  static async updateCategory(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "categories", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await AccountingCategoryModel.updateCategory(id, req.body);

      if (result.success) {
        res.json({ success: true, message: "Category updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete Category
  static async deleteCategory(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "categories", "admin");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await AccountingCategoryModel.deleteCategory(id);

      if (result.success) {
        res.json({ success: true, message: "Category deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Category by ID
  static async getCategoryById(req, res) {
    try {
      const { id } = req.params;
      const result = await AccountingCategoryModel.getCategoryById(id);

      if (result.success) {
        res.json({ success: true, category: result.category });
      } else {
        res.status(404).json({ success: false, error: "Category not found" });
      }
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Import Beneficiaries - Parse and Preview
  static async previewBeneficiaryImport(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const fileExtension = path.extname(req.file.originalname).toLowerCase();

      let data = [];
      let headers = [];

      try {
        if (fileExtension === ".csv") {
          // Parse CSV
          const workbook = xlsx.readFile(filePath, { type: "file" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        } else if (fileExtension === ".xlsx" || fileExtension === ".xls") {
          // Parse Excel
          const workbook = xlsx.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          fs.unlinkSync(filePath);
          return res.status(400).json({ success: false, error: "Unsupported file format. Please upload CSV or Excel file." });
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        if (data.length < 2) {
          return res.status(400).json({ success: false, error: "File must contain at least a header row and one data row" });
        }

        // Find the header row (first non-empty row with multiple columns)
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(5, data.length); i++) {
          const nonEmpty = data[i].filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
          if (nonEmpty.length >= 3) {
            // Header should have at least 3 columns
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          return res.status(400).json({ success: false, error: "Could not find header row in file" });
        }

        // Extract headers
        headers = data[headerRowIndex].map((h) => String(h || "").trim()).filter((h) => h !== "");

        // Extract data rows (skip header and empty rows)
        const rows = data.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));

        // Intelligent column mapping
        const columnMapping = AccountingController.intelligentColumnMapping(headers);

        // Map all rows to objects with headers as keys
        const originalHeaders = data[headerRowIndex];
        const allData = rows.map((row) => {
          const mapped = {};
          headers.forEach((header) => {
            // Find this header's position in the original row
            const headerIndex = originalHeaders.findIndex((h) => String(h || "").trim() === header);
            if (headerIndex !== -1) {
              mapped[header] = row[headerIndex] || "";
            }
          });
          return mapped;
        });

        // Preview first 10 rows for display
        const preview = allData.slice(0, 10);

        res.json({
          success: true,
          headers,
          preview,
          allData, // Send all data for import
          totalRows: rows.length,
          suggestedMapping: columnMapping,
          message: `Found ${rows.length} records to import`,
        });
      } catch (parseError) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error("Error parsing file:", parseError);
        return res.status(400).json({ success: false, error: `Failed to parse file: ${parseError.message}` });
      }
    } catch (error) {
      console.error("Error previewing import:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Intelligent column mapping
  static intelligentColumnMapping(headers) {
    const mapping = {};
    const lowerHeaders = headers.map((h) =>
      String(h || "")
        .toLowerCase()
        .trim(),
    );

    // Field mapping patterns
    const patterns = {
      beneficiary_id: ["beneficiary id", "ben id", "id", "beneficiary code", "code"],
      beneficiary_name: ["name", "beneficiary name", "party name", "vendor name", "account holder", "holder name"],
      alias: ["alias", "short name", "nickname", "display name"],
      account_number: ["account number", "account no", "acc no", "account", "bank account"],
      ifsc_code: ["ifsc", "ifsc code", "ifsc_code", "bank ifsc"],
      bank_name: ["bank name", "bank", "bank_name"],
      contact_number: ["contact", "phone", "mobile", "contact number", "phone number", "mobile number"],
      email: ["email", "e-mail", "email address", "mail"],
      pan_number: ["pan", "pan number", "pan no", "pan_number"],
      gstin: ["gst", "gstin", "gst number", "gst no", "gstn"],
      address: ["address", "location", "place"],
      status: ["status", "active", "state"],
      activation_date: ["activation time", "activation date", "beneficiary activation", "start date", "date", "joining date"],
    };

    // Match headers to fields
    lowerHeaders.forEach((header, index) => {
      for (const [field, keywords] of Object.entries(patterns)) {
        if (keywords.some((keyword) => header.includes(keyword))) {
          if (!mapping[field]) {
            // Only map first match
            mapping[field] = headers[index];
          }
        }
      }
    });

    return mapping;
  }

  // Import Beneficiaries - Final Import
  static async importBeneficiaries(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "beneficiaries", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { fileData, columnMapping } = req.body;

      if (!fileData || !columnMapping) {
        return res.status(400).json({ success: false, error: "Missing file data or column mapping" });
      }

      // Transform rows based on column mapping
      const beneficiaries = fileData.map((row) => {
        const beneficiary = {};

        Object.keys(columnMapping).forEach((field) => {
          const sourceColumn = columnMapping[field];
          if (sourceColumn && row[sourceColumn] !== undefined) {
            let value = String(row[sourceColumn] || "").trim();

            // Special handling for status
            if (field === "status") {
              value = ["active", "1", "yes", "true"].includes(value.toLowerCase()) ? "active" : "inactive";
            }

            // Special handling for dates (including datetime strings)
            if (field === "activation_date" && value) {
              try {
                // Handle various date formats including "DD/MM/YYYY HH:MM AM/PM"
                let dateStr = value;

                // If it contains time (has space or colon), extract date part
                if (String(value).includes(" ") || String(value).includes(":")) {
                  // Extract date part (e.g., "08/09/2025 9:02 PM" -> "08/09/2025")
                  dateStr = String(value).split(" ")[0];
                }

                // Parse DD/MM/YYYY format
                if (dateStr.includes("/")) {
                  const parts = dateStr.split("/");
                  if (parts.length === 3) {
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    // Create date in YYYY-MM-DD format
                    value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
                  }
                } else {
                  // Try standard date parsing
                  const date = new Date(dateStr);
                  if (!isNaN(date.getTime())) {
                    value = date.toISOString().split("T")[0];
                  }
                }
              } catch (e) {
                console.warn(`Failed to parse activation date: ${value}`, e);
                value = null;
              }
            }

            beneficiary[field] = value || null;
          }
        });

        return beneficiary;
      });

      // Filter out empty rows
      const validBeneficiaries = beneficiaries.filter((b) => b.beneficiary_name || b.account_number);

      if (validBeneficiaries.length === 0) {
        return res.status(400).json({ success: false, error: "No valid beneficiary records found" });
      }

      // Fetch bank details from IFSC codes
      console.log("Fetching bank details for IFSC codes...");
      const uniqueIFSCs = [...new Set(validBeneficiaries.map((b) => b.ifsc_code).filter((code) => code))];

      let ifscDetails = {};
      let ifscFetchCount = 0;

      for (const ifsc of uniqueIFSCs) {
        const result = await IFSCService.getBankDetails(ifsc);
        ifscDetails[ifsc] = result;

        if (result.success) {
          ifscFetchCount++;
          console.log(`✓ Fetched bank details for ${ifsc}: ${result.data.bank_name}`);
        } else {
          // Fallback to bank code extraction
          const bankName = IFSCService.getBankCodeFromIFSC(ifsc);
          ifscDetails[ifsc] = { success: true, data: { bank_name: bankName } };
          console.log(`⚠ Using fallback for ${ifsc}: ${bankName}`);
        }

        // Rate limiting: wait 100ms between requests
        if (uniqueIFSCs.indexOf(ifsc) < uniqueIFSCs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`Fetched bank details for ${ifscFetchCount}/${uniqueIFSCs.length} IFSC codes`);

      // Add bank details to beneficiaries
      const enrichedBeneficiaries = validBeneficiaries.map((ben) => {
        if (ben.ifsc_code && ifscDetails[ben.ifsc_code]) {
          const details = ifscDetails[ben.ifsc_code];
          if (details.success && details.data) {
            // Add all bank details from IFSC lookup
            ben.bank_name = details.data.bank_name || null;
            ben.bank_branch = details.data.branch || null;
            ben.bank_city = details.data.city || null;
            ben.bank_state = details.data.state || null;
            ben.bank_address = details.data.address || null;
            ben.bank_contact = details.data.contact || null;
            ben.bank_micr = details.data.micr || null;
          }
        }
        return ben;
      });

      // Import beneficiaries
      const importBatchId = `IMPORT-${Date.now()}`;
      const result = await BeneficiaryModel.bulkImportBeneficiaries(enrichedBeneficiaries, importBatchId, req.user.id);

      if (result.success) {
        res.json({
          success: true,
          message: `Successfully imported ${result.imported} beneficiaries`,
          imported: result.imported,
          failed: result.failed,
          errors: result.errors,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error importing beneficiaries:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ==================== REMITTERS MANAGEMENT ====================

  // Remitters Page
  static async getRemitters(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Remitters.",
          error: { status: 403 },
          user: req.user,
        });
      }

      // Extract filters from query string
      const filters = {
        search: req.query.search || "",
        category: req.query.category || "",
        status: req.query.status || "",
      };

      const remitters = await RemitterModel.getAllRemitters(false, filters);
      const categories = await AccountingCategoryModel.getAllCategories();

      const seo = buildSEO("Remitters", "Manage payment remitters");

      res.render("pages/ops/accounting/remitters", {
        seo,
        pageKey: "accounting/remitters",
        user: req.user,
        remitters: remitters.rows || [],
        categories: categories.rows || [],
        filters,
      });
    } catch (error) {
      console.error("Error loading remitters:", error);
      res.status(500).send("Error loading remitters");
    }
  }

  // API: Create Remitter
  static async createRemitter(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const result = await RemitterModel.createRemitter(req.body);

      if (result.success) {
        res.json({ success: true, message: "Remitter created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating remitter:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Update Remitter
  static async updateRemitter(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await RemitterModel.updateRemitter(id, req.body);

      if (result.success) {
        res.json({ success: true, message: "Remitter updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating remitter:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete Remitter
  static async deleteRemitter(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "admin");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await RemitterModel.deleteRemitter(id);

      if (result.success) {
        res.json({ success: true, message: "Remitter deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting remitter:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get Remitter by ID
  static async getRemitterById(req, res) {
    try {
      const { id } = req.params;
      const result = await RemitterModel.getRemitterById(id);

      if (result.success) {
        res.json({ success: true, remitter: result.remitter });
      } else {
        res.status(404).json({ success: false, error: "Remitter not found" });
      }
    } catch (error) {
      console.error("Error fetching remitter:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Import Remitters (Bulk)
  static async importRemitters(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { fileData, columnMapping } = req.body;

      if (!fileData || !columnMapping) {
        return res.status(400).json({ success: false, error: "Missing file data or column mapping" });
      }

      // Transform rows based on column mapping
      const remitters = fileData.map((row) => {
        const remitter = {};

        Object.keys(columnMapping).forEach((field) => {
          const sourceColumn = columnMapping[field];
          if (sourceColumn && row[sourceColumn] !== undefined) {
            let value = String(row[sourceColumn] || "").trim();

            // Special handling for status
            if (field === "status") {
              value = ["active", "1", "yes", "true"].includes(value.toLowerCase()) ? "active" : "inactive";
            }

            // Special handling for dates
            if (field === "activation_date" && value) {
              try {
                let dateStr = value;
                if (String(value).includes(" ") || String(value).includes(":")) {
                  dateStr = String(value).split(" ")[0];
                }
                if (dateStr.includes("/")) {
                  const parts = dateStr.split("/");
                  if (parts.length === 3) {
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
                  }
                } else {
                  const date = new Date(dateStr);
                  if (!isNaN(date.getTime())) {
                    value = date.toISOString().split("T")[0];
                  }
                }
              } catch (e) {
                console.warn(`Failed to parse activation date: ${value}`, e);
                value = null;
              }
            }

            remitter[field] = value || null;
          }
        });

        return remitter;
      });

      // Filter out empty rows
      const validRemitters = remitters.filter((r) => r.remitter_name || r.account_number);

      if (validRemitters.length === 0) {
        return res.status(400).json({ success: false, error: "No valid remitter records found" });
      }

      // Fetch bank details from IFSC codes
      console.log("Fetching bank details for IFSC codes...");
      const uniqueIFSCs = [...new Set(validRemitters.map((r) => r.ifsc_code).filter((code) => code))];

      let ifscDetails = {};
      let ifscFetchCount = 0;

      for (const ifsc of uniqueIFSCs) {
        const result = await IFSCService.getBankDetails(ifsc);
        ifscDetails[ifsc] = result;

        if (result.success) {
          ifscFetchCount++;
          console.log(`✓ Fetched bank details for ${ifsc}: ${result.data.bank_name}`);
        } else {
          const bankName = IFSCService.getBankCodeFromIFSC(ifsc);
          ifscDetails[ifsc] = { success: true, data: { bank_name: bankName } };
          console.log(`⚠ Using fallback for ${ifsc}: ${bankName}`);
        }

        if (uniqueIFSCs.indexOf(ifsc) < uniqueIFSCs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`Fetched bank details for ${ifscFetchCount}/${uniqueIFSCs.length} IFSC codes`);

      // Add bank details to remitters
      const enrichedRemitters = validRemitters.map((rem) => {
        if (rem.ifsc_code && ifscDetails[rem.ifsc_code]) {
          const details = ifscDetails[rem.ifsc_code];
          if (details.success && details.data) {
            rem.bank_name = details.data.bank_name || null;
            rem.bank_branch = details.data.branch || null;
            rem.bank_city = details.data.city || null;
            rem.bank_state = details.data.state || null;
            rem.bank_address = details.data.address || null;
            rem.bank_contact = details.data.contact || null;
            rem.bank_micr = details.data.micr || null;
          }
        }
        return rem;
      });

      // Import remitters
      const importBatchId = `IMPORT-${Date.now()}`;
      const result = await RemitterModel.bulkImportRemitters(enrichedRemitters, importBatchId, req.user.id);

      if (result.success) {
        res.json({
          success: true,
          message: `Successfully imported ${result.imported} remitters`,
          imported: result.imported,
          failed: result.failed,
          errors: result.errors,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error importing remitters:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Preview Remitter Import
  static async previewRemitterImport(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "remitters", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const fileExtension = path.extname(req.file.originalname).toLowerCase();

      let data = [];
      let headers = [];

      try {
        if (fileExtension === ".csv") {
          const workbook = xlsx.readFile(filePath, { type: "file" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        } else if (fileExtension === ".xlsx" || fileExtension === ".xls") {
          const workbook = xlsx.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          fs.unlinkSync(filePath);
          return res.status(400).json({ success: false, error: "Unsupported file format" });
        }

        fs.unlinkSync(filePath);

        if (data.length < 2) {
          return res.status(400).json({ success: false, error: "File must contain at least a header row and one data row" });
        }

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(5, data.length); i++) {
          const nonEmpty = data[i].filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
          if (nonEmpty.length >= 3) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          return res.status(400).json({ success: false, error: "Could not find header row" });
        }

        headers = data[headerRowIndex].map((h) => String(h || "").trim()).filter((h) => h !== "");

        // Extract data rows
        const dataRows = data.slice(headerRowIndex + 1).filter((row) => {
          const nonEmpty = row.filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "");
          return nonEmpty.length > 0;
        });

        // Convert to objects
        const jsonData = dataRows.map((row) => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] !== undefined ? row[index] : null;
          });
          return obj;
        });

        res.json({
          success: true,
          headers,
          preview: jsonData.slice(0, 10),
          totalRows: jsonData.length,
          allData: jsonData,
        });
      } catch (error) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        throw error;
      }
    } catch (error) {
      console.error("Error previewing remitter import:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Bank Statement Import - Preview
  static async previewBankStatementImport(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const bankAccountId = req.body.bankAccountId;
      if (!bankAccountId) {
        return res.status(400).json({ success: false, error: "Bank account ID is required" });
      }

      const filePath = req.file.path;

      try {
        // Get the selected bank account to determine bank type
        const accountResult = await BankAccountModel.getAccountById(bankAccountId);
        if (!accountResult.success || !accountResult.account) {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return res.status(400).json({ success: false, error: "Invalid bank account selected" });
        }

        const bankAccount = accountResult.account;

        // Determine bank type from account's bank_name
        let bankType = "UNKNOWN";
        const bankNameLower = bankAccount.bank_name.toLowerCase();
        if (bankNameLower.includes("icici")) {
          bankType = "ICICI";
        } else if (bankNameLower.includes("axis")) {
          bankType = "AXIS";
        } else if (bankNameLower.includes("hdfc")) {
          bankType = "HDFC";
        } else if (bankNameLower.includes("sbi") || bankNameLower.includes("state bank")) {
          bankType = "SBI";
        }

        // Parse the file
        const parseResult = BankStatementParser.parseFile(filePath);

        // Clean up uploaded file
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        if (!parseResult.success) {
          return res.status(400).json({ success: false, error: parseResult.error });
        }

        const preview = parseResult.transactions.slice(0, 10);

        res.json({
          success: true,
          headers: parseResult.headers,
          preview,
          allData: parseResult.transactions, // Send all data for import
          totalRows: parseResult.totalRows,
          suggestedMapping: parseResult.suggestedMapping,
          headerRowIndex: parseResult.headerRowIndex,
          bankType,
          bankAccountName: bankAccount.account_name,
          message: `${bankType} bank statement: ${parseResult.totalRows} transactions found`,
        });
      } catch (parseError) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error("Error parsing bank statement:", parseError);
        return res.status(400).json({ success: false, error: `Failed to parse file: ${parseError.message}` });
      }
    } catch (error) {
      console.error("Error previewing bank statement:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Bank Statement Import - Execute
  static async importBankStatement(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { fileData, columnMapping, bankAccountId, fileName } = req.body;

      console.log("Import request received:", {
        hasFileData: !!fileData,
        fileDataLength: fileData ? fileData.length : 0,
        hasColumnMapping: !!columnMapping,
        columnMappingKeys: columnMapping ? Object.keys(columnMapping) : [],
        bankAccountId: bankAccountId,
        fileName: fileName,
      });

      if (!fileData || !columnMapping || !bankAccountId) {
        const error = !fileData ? "Missing file data" : !columnMapping ? "Missing column mapping" : "Missing bank account ID";
        console.error("Import validation failed:", error);
        return res.status(400).json({ success: false, error: error });
      }

      console.log(`Starting bank statement import for bank account ${bankAccountId} from file: ${fileName || "unknown"}...`);

      // Get all beneficiaries for auto-matching (debit transactions)
      const beneficiariesResult = await BeneficiaryModel.getAllBeneficiaries(true);
      const beneficiaries = beneficiariesResult.rows || [];

      // Get all remitters for auto-matching (credit transactions)
      const remittersResult = await RemitterModel.getAllRemitters(true);
      const remitters = remittersResult.rows || [];

      // Get past transactions with narrations for auto-fill
      const pastTransactionsResult = await TransactionModel.getPastTransactionsWithNarrations(bankAccountId);
      const pastTransactions = pastTransactionsResult.rows || [];

      console.log(`Loaded ${beneficiaries.length} beneficiaries, ${remitters.length} remitters, and ${pastTransactions.length} past transactions for matching`);

      // Transform rows based on column mapping
      const transactions = [];
      let matchedCount = 0;
      let narrationAutoFilled = 0;

      for (const row of fileData) {
        const transaction = {
          bank_account_id: bankAccountId,
        };

        // Map columns
        let crDrIndicator = null;
        let transactionAmount = 0;

        Object.keys(columnMapping).forEach((field) => {
          const sourceColumn = columnMapping[field];
          if (sourceColumn && row[sourceColumn] !== undefined) {
            const value = row[sourceColumn];

            if (field === "transaction_date") {
              transaction.transaction_date = BankStatementParser.parseDate(value);
            } else if (field === "debit_amount") {
              transaction.debit_amount = BankStatementParser.parseAmount(value);
            } else if (field === "credit_amount") {
              transaction.credit_amount = BankStatementParser.parseAmount(value);
            } else if (field === "balance") {
              transaction.balance = BankStatementParser.parseAmount(value);
            } else if (field === "cr_dr_indicator") {
              crDrIndicator = String(value).trim().toUpperCase();
            } else if (field === "transaction_amount") {
              transactionAmount = BankStatementParser.parseAmount(value);
            } else {
              transaction[field] = value ? String(value).trim() : null;
            }
          }
        });

        // Handle ICICI/Axis format: Cr/Dr indicator + Transaction Amount
        if (crDrIndicator && transactionAmount > 0) {
          if (crDrIndicator === "DR" || crDrIndicator === "DEBIT") {
            transaction.debit_amount = transactionAmount;
            transaction.credit_amount = 0;
          } else if (crDrIndicator === "CR" || crDrIndicator === "CREDIT") {
            transaction.credit_amount = transactionAmount;
            transaction.debit_amount = 0;
          }
        }

        // Ensure amounts are set (default to 0 if not set)
        if (transaction.debit_amount === undefined) transaction.debit_amount = 0;
        if (transaction.credit_amount === undefined) transaction.credit_amount = 0;

        // Skip rows without essential data
        if (!transaction.transaction_date || (transaction.debit_amount === 0 && transaction.credit_amount === 0)) {
          continue;
        }

        // Auto-match beneficiary for debit transactions
        if (transaction.debit_amount > 0 && transaction.description) {
          const match = await BankStatementParser.autoMatchBeneficiary(transaction.description, beneficiaries);
          if (match) {
            transaction.beneficiary_id = match.beneficiary_id;
            transaction.is_matched = true;
            transaction.notes = `Auto-matched via ${match.match_type} (${match.confidence} confidence)`;

            // Auto-assign category from matched beneficiary
            const matchedBeneficiary = beneficiaries.find((b) => b.id === match.beneficiary_id);
            if (matchedBeneficiary && matchedBeneficiary.category_id) {
              transaction.category_id = matchedBeneficiary.category_id;
            }

            matchedCount++;
          }
        }

        // Auto-match remitter for credit transactions
        if (transaction.credit_amount > 0 && transaction.description) {
          const match = await BankStatementParser.autoMatchRemitter(transaction.description, remitters);
          if (match) {
            transaction.remitter_id = match.remitter_id;
            transaction.is_matched = true;
            transaction.notes = `Auto-matched via ${match.match_type} (${match.confidence} confidence)`;

            // Auto-assign category from matched remitter
            const matchedRemitter = remitters.find((r) => r.id === match.remitter_id);
            if (matchedRemitter && matchedRemitter.category_id) {
              transaction.category_id = matchedRemitter.category_id;
            }

            matchedCount++;
          }
        }

        // Auto-fill narration from past similar transactions
        const narrationMatch = BankStatementParser.autoFillNarration(transaction, pastTransactions);
        if (narrationMatch) {
          transaction.narration = narrationMatch.narration;

          // Also copy category and payment mode if not already set
          if (!transaction.category_id && narrationMatch.category_id) {
            transaction.category_id = narrationMatch.category_id;
          }
          if (!transaction.payment_mode && narrationMatch.payment_mode) {
            transaction.payment_mode = narrationMatch.payment_mode;
          }

          // Add to notes
          const existingNotes = transaction.notes || "";
          transaction.notes = existingNotes ? `${existingNotes} | Narration auto-filled (${narrationMatch.confidence} confidence)` : `Narration auto-filled from past transaction (${narrationMatch.confidence} confidence)`;

          narrationAutoFilled++;
        }

        transactions.push(transaction);
      }

      if (transactions.length === 0) {
        return res.status(400).json({ success: false, error: "No valid transactions found" });
      }

      console.log(`Prepared ${transactions.length} transactions, ${matchedCount} auto-matched beneficiaries, ${narrationAutoFilled} narrations auto-filled`);

      // Import transactions
      const importBatchId = `BANK-STMT-${Date.now()}`;
      const result = await TransactionModel.bulkImportTransactions(
        transactions,
        importBatchId,
        req.user.id,
        fileName || "bank_statement_import.csv",
        null, // file_path - not stored since file is deleted after preview
        bankAccountId,
      );

      if (result.success) {
        res.json({
          success: true,
          message: `Successfully imported ${result.imported} transactions (${matchedCount} beneficiaries matched, ${narrationAutoFilled} narrations auto-filled)`,
          imported: result.imported,
          failed: result.failed,
          matched: matchedCount,
          narrationAutoFilled: narrationAutoFilled,
          errors: result.errors,
          importBatchId: importBatchId,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error importing bank statement:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ==================== Bank Accounts Management ====================

  // Get Bank Accounts Page
  static async getBankAccounts(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "bank_accounts", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Bank Accounts.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const accounts = await BankAccountModel.getAllAccounts();
      const seo = buildSEO("Bank Accounts", "Manage bank accounts");

      res.render("pages/ops/accounting/bank-accounts", {
        seo,
        pageKey: "accounting/bank-accounts",
        user: req.user,
        bankAccounts: accounts.rows || [],
      });
    } catch (error) {
      console.error("Error loading bank accounts:", error);
      res.status(500).send("Error loading bank accounts");
    }
  }

  // API: Get Bank Account by ID
  static async getBankAccountById(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "bank_accounts", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await BankAccountModel.getAccountById(id);

      if (result.success) {
        res.json({ success: true, account: result.account });
      } else {
        res.status(404).json({ success: false, error: "Bank account not found" });
      }
    } catch (error) {
      console.error("Error fetching bank account:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Create Bank Account
  static async createBankAccount(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "bank_accounts", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const result = await BankAccountModel.createAccount(req.body);

      if (result.success) {
        res.json({ success: true, message: "Bank account created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating bank account:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Update Bank Account
  static async updateBankAccount(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "bank_accounts", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await BankAccountModel.updateAccount(id, req.body);

      if (result.success) {
        res.json({ success: true, message: "Bank account updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating bank account:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete Bank Account
  static async deleteBankAccount(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "bank_accounts", "admin");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await BankAccountModel.deleteAccount(id);

      if (result.success) {
        res.json({ success: true, message: "Bank account deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting bank account:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Download transactions as CSV
  static async downloadTransactionsCSV(req, res) {
    try {
      // Check accounting access
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      // Get filter parameters
      const { bank_account_id, start_date, end_date, category_id, beneficiary_id, remitter_id, search } = req.query;

      // Build filters object
      const filters = {
        bank_account_id: bank_account_id || null,
        start_date: start_date || null,
        end_date: end_date || null,
        category_id: category_id || null,
        beneficiary_id: beneficiary_id || null,
        remitter_id: remitter_id || null,
        search: search || null,
        limit: 10000, // Large limit for CSV export
      };

      // Get transactions with filters
      const result = await TransactionModel.getTransactions(filters);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      const transactions = result.transactions;

      // Prepare CSV headers
      const csvHeaders = ["Transaction ID", "Date", "Description", "Narration", "Beneficiary", "Remitter", "Category", "Payment Mode", "Debit Amount", "Credit Amount", "Balance", "Status", "Invoice URL", "Created At"];

      // Prepare CSV data
      const csvData = transactions.map((txn) => [txn.id || "", txn.transaction_date ? new Date(txn.transaction_date).toLocaleDateString("en-GB") : "", txn.description || "", txn.narration || "", txn.beneficiary_name || "", txn.remitter_name || "", txn.category_name || "", txn.payment_mode || "", txn.debit_amount || "", txn.credit_amount || "", txn.balance || "", txn.is_matched ? "Matched" : "Pending", txn.invoice_url || "", txn.created_at ? new Date(txn.created_at).toLocaleString("en-GB") : ""]);

      // Combine headers and data
      const csvContent = [csvHeaders, ...csvData]
        .map((row) =>
          row
            .map((cell) => {
              // Escape CSV special characters
              const cellStr = String(cell || "");
              if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
                return `"${cellStr.replace(/"/g, '""')}"`;
              }
              return cellStr;
            })
            .join(","),
        )
        .join("\n");

      // Set response headers for CSV download
      const filename = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      // Send CSV content
      res.send(csvContent);
    } catch (error) {
      console.error("Error downloading transactions CSV:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ==================== Import Logs Management ====================

  // Get Import Logs Page
  static async getImportLogs(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Import Logs.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const { import_type, bank_account_id, start_date, end_date, page = 1, limit = 25 } = req.query;

      // Parse pagination parameters
      const currentPage = parseInt(page) || 1;
      const entriesPerPage = parseInt(limit) || 25;
      const offset = (currentPage - 1) * entriesPerPage;

      const filters = {
        import_type,
        bank_account_id,
        start_date,
        end_date,
        limit: entriesPerPage,
        offset: offset,
      };

      const result = await ImportLogModel.getImportLogs(filters);
      const logs = result.rows || [];
      const pagination = result.pagination || { total: 0, totalPages: 0 };

      // Get bank accounts for filter
      const bankAccounts = await BankAccountModel.getAllAccounts();

      // Get statistics
      const statsResult = await ImportLogModel.getImportStatistics({ start_date, end_date });
      const statistics = statsResult.statistics || [];

      const seo = buildSEO("Import Logs", "View import history and logs");

      // Calculate pagination values
      const totalRecords = pagination.total;
      const totalPages = pagination.totalPages;
      const startRecord = totalRecords > 0 ? offset + 1 : 0;
      const endRecord = Math.min(offset + entriesPerPage, totalRecords);

      res.render("pages/ops/accounting/import-logs", {
        seo,
        pageKey: "accounting/import-logs",
        user: req.user,
        logs,
        statistics,
        bankAccounts: bankAccounts.rows || [],
        filters: {
          import_type,
          bank_account_id,
          start_date: start_date || "",
          end_date: end_date || "",
          limit: entriesPerPage,
        },
        pagination: {
          currentPage,
          totalPages,
          totalRecords,
          startRecord,
          endRecord,
          entriesPerPage,
        },
      });
    } catch (error) {
      console.error("Error loading import logs:", error);
      res.status(500).send("Error loading import logs");
    }
  }

  // API: Get Import Log Details
  static async getImportLogDetails(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "transactions", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      const result = await ImportLogModel.getImportLogById(id);

      if (result.success) {
        res.json({ success: true, log: result.log });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error getting import log details:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ==================== WALLET ACCOUNTING METHODS ====================

  // Wallet Accounting Dashboard
  static async getWalletAccountingDashboard(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Wallet Accounting.",
          error: { status: 403 },
          user: req.user,
        });
      }

      // Get date range from query or default to last 30 days
      const today = new Date();
      const endDate = req.query.end_date || today.toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const startDate = req.query.start_date || thirtyDaysAgo.toISOString().split("T")[0];

      // Get dashboard summary
      const summary = await WalletAccountingModel.getDashboardSummary(startDate, endDate);

      // Get reconciliation report
      const reconciliation = await WalletAccountingModel.getReconciliationReport(startDate, endDate);

      // Get daily trend for chart
      const trend = await WalletAccountingModel.getDailyTrend(startDate, endDate);

      // Get recent sync log
      const syncLog = await WalletAccountingModel.getSyncLog(20);

      // Get adjustments in the selected range
      const adjustments = await WalletAccountingModel.getAdjustments(startDate, endDate);

      const seo = buildSEO("Wallet Accounting", "Customer wallet liability and revenue reconciliation");

      const rawSyncLog = syncLog.data || [];
      const syncLogGroupedMap = new Map();

      for (const entry of rawSyncLog) {
        const dateKey = entry.sync_date
          ? new Date(entry.sync_date).toISOString().slice(0, 10)
          : entry.created_at
          ? new Date(entry.created_at).toISOString().slice(0, 10)
          : null;

        if (!dateKey) continue;

        if (!syncLogGroupedMap.has(dateKey)) {
          syncLogGroupedMap.set(dateKey, {
            date: dateKey,
            recharge: null,
            sales: null,
            reconciliation: null,
          });
        }

        const group = syncLogGroupedMap.get(dateKey);
        if (entry.sync_type === "recharge") {
          group.recharge = entry;
        } else if (entry.sync_type === "sales") {
          group.sales = entry;
        } else if (entry.sync_type === "reconciliation") {
          group.reconciliation = entry;
        }
      }

      const syncLogTable = Array.from(syncLogGroupedMap.values()).sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      );

      res.render("pages/ops/accounting/wallet-accounting", {
        seo,
        pageKey: "accounting/wallet",
        user: req.user,
        startDate,
        endDate,
        summary: summary.data || {},
        reconciliation: reconciliation.data || [],
        trend: trend.data || [],
        syncLog: syncLogTable,
        adjustments: adjustments.data || [],
      });
    } catch (error) {
      console.error("Error loading wallet accounting dashboard:", error);
      res.status(500).send("Error loading wallet accounting dashboard");
    }
  }

  // API: Sync wallet data for a date range
  static async syncWalletData(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date, end_date } = req.body;

      if (!start_date || !end_date) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const result = await WalletAccountingModel.syncDateRange(start_date, end_date);

      res.json(result);
    } catch (error) {
      console.error("Error syncing wallet data:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Sync single date
  static async syncSingleDate(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { date } = req.body;

      if (!date) {
        return res.status(400).json({ success: false, error: "Date is required" });
      }

      // Sync recharges
      const rechargeResult = await WalletAccountingModel.syncWalletRecharges(date);
      // Sync sales
      const salesResult = await WalletAccountingModel.syncSalesRevenue(date);
      // Perform reconciliation
      const reconResult = await WalletAccountingModel.performReconciliation(date);

      res.json({
        success: true,
        data: {
          recharges: rechargeResult,
          sales: salesResult,
          reconciliation: reconResult,
        },
      });
    } catch (error) {
      console.error("Error syncing single date:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get reconciliation report
  static async getWalletReconciliationReport(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const result = await WalletAccountingModel.getReconciliationReport(start_date, end_date);

      res.json(result);
    } catch (error) {
      console.error("Error fetching reconciliation report:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get dashboard summary
  static async getWalletDashboardSummary(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const result = await WalletAccountingModel.getDashboardSummary(start_date, end_date);

      res.json(result);
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Download reconciliation CSV
  static async downloadWalletReconciliationCSV(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const result = await WalletAccountingModel.getReconciliationReport(start_date, end_date);
      const salesDetailResult = await WalletAccountingModel.getSalesLineItems(start_date, end_date);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      const formatCurrency = (value) => Number(parseFloat(value || 0).toFixed(2)).toString();
      const formatDateString = (dateValue) => {
        if (!dateValue) return "";
        const dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue);
        if (Number.isNaN(dateObj.getTime())) {
          return String(dateValue);
        }
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      const csvEscape = (value) => {
        if (value === null || value === undefined) return "";
        const stringValue = String(value);
        if (/[",\n]/.test(stringValue)) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      const summaryHeaders = [
        "Date",
        "Opening Balance",
        "Recharges",
        "Sales",
        "GST on Sales",
        "Adjustment Increase",
        "Adjustment Decrease",
        "Closing Balance",
        "App Wallet Balance",
        "Variance",
        "Reconciled",
        "Adjustment Notes",
      ];

      const salesGstByDate = new Map();
      const salesDetailRows = (salesDetailResult.success ? salesDetailResult.data : []).map((row) => {
        const lineTotal = Number(row.line_total || 0);
        const gstPercentage = Number(row.gst_percentage || 0);
        const gstTotal = (lineTotal * gstPercentage) / 100;
        const gstHalf = gstTotal / 2;
        const unitPrice = Number(row.price || 0);

        const dateKey = formatDateString(row.order_date);
        salesGstByDate.set(dateKey, (salesGstByDate.get(dateKey) || 0) + gstTotal);

        return [
          formatDateString(row.order_date),
          row.order_id ?? "",
          row.product_name || "",
          row.unit_size || "",
          row.quantity ?? 0,
          formatCurrency(unitPrice),
          gstPercentage ? `${gstPercentage}%` : "0%",
          formatCurrency(gstHalf),
          formatCurrency(gstHalf),
          formatCurrency(lineTotal),
          row.customer_name || "",
          row.customer_phone || "",
          row.locality_name || "",
          row.complete_address || "",
        ];
      });

      const detailHeaders = [
        "Date",
        "Order ID",
        "Product",
        "Unit Size",
        "Quantity",
        "Unit Price",
        "GST%",
        "SGST",
        "CGST",
        "Total Amount",
        "Customer Name",
        "Customer Phone",
        "Locality",
        "Complete Address",
      ];

      const summaryRows = result.data.map((row) => {
        const dateKey = formatDateString(row.reconciliation_date);
        const gstForDate = salesGstByDate.get(dateKey) || 0;

        return [
          dateKey,
          formatCurrency(row.opening_balance),
          formatCurrency(row.total_recharges),
          formatCurrency(row.total_sales),
          formatCurrency(gstForDate),
          formatCurrency(row.adjustment_increase),
          formatCurrency(row.adjustment_decrease),
          formatCurrency(row.closing_balance),
          row.app_wallet_balance !== null ? formatCurrency(row.app_wallet_balance) : "",
          formatCurrency(row.variance),
          row.is_reconciled ? "Yes" : "No",
          row.adjustment_notes || "",
        ];
      });

      const summarySection = [
        summaryHeaders.map(csvEscape).join(","),
        ...summaryRows.map((row) => row.map(csvEscape).join(",")),
      ].join("\n");

      const detailSection =
        salesDetailRows.length > 0
          ? [
              detailHeaders.map(csvEscape).join(","),
              ...salesDetailRows.map((row) => row.map(csvEscape).join(",")),
            ].join("\n")
          : "No sales records found for the selected range.";

      const combinedCsv = `${summarySection}\n\nSales Details\n${detailSection}`;
      const buffer = Buffer.from(combinedCsv, "utf8");
      const fileName = `wallet-reconciliation-${start_date}-to-${end_date}.csv`;

      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(buffer);
    } catch (error) {
      console.error("Error downloading reconciliation CSV:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: List wallet adjustments
  static async getWalletAdjustments(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date, end_date } = req.query;

      if (!start_date || !end_date) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const result = await WalletAccountingModel.getAdjustments(start_date, end_date);
      res.json(result);
    } catch (error) {
      console.error("Error fetching wallet adjustments:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Create wallet adjustment
  static async createWalletAdjustment(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { adjustment_date, date, amount, reason, notes } = req.body || {};
      const targetDate = adjustment_date || date;

      if (!targetDate) {
        return res.status(400).json({ success: false, error: "Adjustment date is required" });
      }

      if (amount === undefined || amount === null || amount === "") {
        return res.status(400).json({ success: false, error: "Amount is required" });
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
        return res.status(400).json({ success: false, error: "Amount must be a non-zero number" });
      }

      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ success: false, error: "Reason is required" });
      }

      const payload = {
        date: targetDate,
        amount: parsedAmount,
        reason: String(reason).trim(),
        notes: notes ? String(notes).trim() : null,
        createdBy: req.user?.id || null,
      };

      const result = await WalletAccountingModel.createAdjustment(payload);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to save adjustment" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error creating wallet adjustment:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete wallet adjustment
  static async deleteWalletAdjustment(req, res) {
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: "Adjustment id is required" });
      }

      const result = await WalletAccountingModel.deleteAdjustment(id);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to delete adjustment" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting wallet adjustment:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Set opening balance manually
  static async setManualOpeningBalance(req, res) {
    let connection;
    try {
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "write");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Permission denied" });
      }

      const { start_date: startDateRaw, opening_balance: openingBalanceRaw, note } = req.body || {};

      if (!startDateRaw) {
        return res.status(400).json({ success: false, error: "Start date is required" });
      }

      if (openingBalanceRaw === undefined || openingBalanceRaw === null || openingBalanceRaw === "") {
        return res.status(400).json({ success: false, error: "Opening balance is required" });
      }

      const openingBalance = Number(openingBalanceRaw);
      if (!Number.isFinite(openingBalance)) {
        return res.status(400).json({ success: false, error: "Opening balance must be a valid number" });
      }

      const startDate = new Date(startDateRaw);
      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ success: false, error: "Invalid start date" });
      }

      const prevDateObj = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
      prevDateObj.setUTCDate(prevDateObj.getUTCDate() - 1);
      const previousDate = prevDateObj.toISOString().split("T")[0];
      const startDateIso = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())).toISOString().split("T")[0];

      connection = await opsPool.getConnection();
      await connection.beginTransaction();

      const manualNote =
        note && String(note).trim().length > 0
          ? String(note).trim()
          : `Manual opening balance set on ${new Date().toISOString()}`;

      await connection.query(
        `INSERT INTO wallet_liability_reconciliation 
          (reconciliation_date, opening_balance, total_recharges, total_sales, closing_balance, app_wallet_balance, variance, is_reconciled, notes, created_at, updated_at)
        VALUES (?, ?, 0, 0, ?, NULL, 0, 1, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          opening_balance = VALUES(opening_balance),
          total_recharges = VALUES(total_recharges),
          total_sales = VALUES(total_sales),
          closing_balance = VALUES(closing_balance),
          app_wallet_balance = VALUES(app_wallet_balance),
          variance = VALUES(variance),
          is_reconciled = VALUES(is_reconciled),
          notes = VALUES(notes),
          updated_at = NOW()`,
        [previousDate, openingBalance, openingBalance, manualNote],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Opening balance saved successfully.",
        data: {
          previous_date: previousDate,
          start_date: startDateIso,
          opening_balance: openingBalance,
        },
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("Error setting manual opening balance:", error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Wallet Recharges Monitoring Page
   */
  static async getWalletRecharges(req, res) {
    try {
      // Check access
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/error", {
          seo: buildSEO({ title: "Access Denied" }),
          pageKey: "error",
          error: {
            code: 403,
            message: "You don't have permission to access wallet recharges",
          },
          user: req.user,
        });
      }

      const seo = buildSEO({ title: "Wallet Recharges - Accounting" });

      res.render("pages/ops/accounting/wallet-recharges", {
        seo,
        pageKey: "ops/accounting/wallet-recharges",
        user: req.user,
        section: "Accounting",
        subsection: "Wallet Recharges",
      });
    } catch (error) {
      console.error("Error loading wallet recharges page:", error);
      res.status(500).render("pages/error", {
        seo: buildSEO({ title: "Error" }),
        pageKey: "error",
        error: {
          code: 500,
          message: "Failed to load wallet recharges page",
        },
        user: req.user,
      });
    }
  }

  /**
   * API endpoint for wallet recharges data
   */
  static async getWalletRechargesAPI(req, res) {
    try {
      // Check access
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      const { startDate, endDate, status = "all", page = 1, limit = 25 } = req.query;

      // Validate required parameters
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const { WalletRechargesModel } = await import("../models/WalletRechargesModel.js");

      const result = await WalletRechargesModel.getWalletRecharges({
        startDate,
        endDate,
        status,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching wallet recharges API:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * API endpoint for wallet recharges summary
   */
  static async getWalletRechargesSummary(req, res) {
    try {
      // Check access
      const hasAccess = await AccountingController.checkAccountingAccess(req.user, "wallet", "read");
      if (!hasAccess) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      const { startDate, endDate, status = "all" } = req.query;

      // Validate required parameters
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, error: "Start date and end date are required" });
      }

      const { WalletRechargesModel } = await import("../models/WalletRechargesModel.js");

      const [summaryResult, breakdownResult] = await Promise.all([
        WalletRechargesModel.getRechargesSummary({ startDate, endDate, status }),
        WalletRechargesModel.getStatusBreakdown({ startDate, endDate }),
      ]);

      res.json({
        success: true,
        summary: summaryResult.summary,
        breakdown: breakdownResult.breakdown,
      });
    } catch (error) {
      console.error("Error fetching wallet recharges summary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
