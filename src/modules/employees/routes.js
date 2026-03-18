import express from "express";
import { EmployeeController } from "./controllers/EmployeeController.js";
import employeePhotoUpload from "../../middleware/employeePhotoUpload.js";
import employeeDocumentUpload from "../../middleware/employeeDocumentUpload.js";

const router = express.Router();

// Employee Management UI
router.get("/", EmployeeController.renderEmployeesPage);
router.get("/roles", EmployeeController.renderRolesPage);

// Employee Management APIs (must come before /:employeeId route)
router.get("/api/employees", EmployeeController.listEmployees);
router.get("/api/employees/:employeeId", EmployeeController.getEmployee);
router.post("/api/employees/upload-photo", employeePhotoUpload.single("photo"), EmployeeController.uploadPhoto);
router.post("/api/employees", employeePhotoUpload.single("photo"), EmployeeController.createEmployee);
router.patch("/api/employees/:employeeId", employeePhotoUpload.single("photo"), EmployeeController.updateEmployee);
router.delete("/api/employees/:employeeId", EmployeeController.deleteEmployee);

// Role Management APIs
router.get("/api/roles", EmployeeController.listRoles);
router.post("/api/roles", EmployeeController.createRole);
router.patch("/api/roles/:roleId", EmployeeController.updateRole);
router.delete("/api/roles/:roleId", EmployeeController.deleteRole);

// Salary Package APIs
router.get("/api/employees/:employeeId/salary", EmployeeController.getSalaryPackage);
router.post("/api/employees/:employeeId/salary", EmployeeController.createSalaryPackage);
router.patch("/api/salary/:salaryPackageId", EmployeeController.updateSalaryPackage);

// Loan Management APIs
router.get("/api/employees/:employeeId/loans", EmployeeController.listLoans);
router.get("/api/loans/:loanId", EmployeeController.getLoan);
router.post("/api/employees/:employeeId/loans", EmployeeController.createLoan);
router.patch("/api/loans/:loanId", EmployeeController.updateLoan);
router.delete("/api/loans/:loanId", EmployeeController.deleteLoan);

// Loan Repayment APIs
router.get("/api/loans/:loanId/repayments", EmployeeController.listRepayments);
router.post("/api/loans/:loanId/repayments", EmployeeController.createRepayment);
router.patch("/api/repayments/:repaymentId", EmployeeController.updateRepayment);
router.delete("/api/repayments/:repaymentId", EmployeeController.deleteRepayment);

// Document Management APIs
router.get("/api/employees/:employeeId/documents", EmployeeController.listDocuments);
router.get("/api/documents/:documentId", EmployeeController.getDocument);
router.post("/api/employees/:employeeId/documents", employeeDocumentUpload.single("document"), EmployeeController.createDocument);
router.patch("/api/documents/:documentId", EmployeeController.updateDocument);
router.delete("/api/documents/:documentId", EmployeeController.deleteDocument);

// Employee Detail UI (must come after API routes)
router.get("/:employeeId", EmployeeController.renderEmployeeDetailPage);

export default router;

