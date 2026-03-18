import EmployeeModel from "../models/EmployeeModel.js";
import EmployeeRoleModel from "../models/EmployeeRoleModel.js";
import EmployeeSalaryPackageModel from "../models/EmployeeSalaryPackageModel.js";
import EmployeeLoanModel from "../models/EmployeeLoanModel.js";
import EmployeeLoanRepaymentModel from "../models/EmployeeLoanRepaymentModel.js";
import EmployeeDocumentModel from "../models/EmployeeDocumentModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class EmployeeController {
  // UI Routes
  static async renderEmployeesPage(req, res) {
    try {
      const seo = buildSEO({ title: "Employee Management — Ops", url: req.path });
      const [rolesResult, statsResult] = await Promise.all([
        EmployeeRoleModel.listRoles(),
        EmployeeModel.getSummaryStats(),
      ]);
      const roles = rolesResult.success ? rolesResult.roles : [];
      const stats = statsResult.success ? statsResult.stats : { total: 0, active: 0, inactive: 0, totalRoles: 0 };

      res.render("pages/ops/employees/index", {
        seo,
        pageKey: "ops/employees/index",
        promo: false,
        user: req.user,
        roles,
        stats,
      });
    } catch (error) {
      console.error("EmployeeController.renderEmployeesPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Employee Management — Error" },
        pageKey: "ops/employees/error",
        promo: false,
        user: req.user,
        title: "Unable to load Employee Management",
        message: "Something went wrong while loading the Employee Management module.",
        error,
      });
    }
  }

  static async renderRolesPage(req, res) {
    try {
      const seo = buildSEO({ title: "Manage Roles — Employee Management", url: req.path });
      const rolesResult = await EmployeeRoleModel.listRoles();
      const roles = rolesResult.success ? rolesResult.roles : [];

      res.render("pages/ops/employees/roles", {
        seo,
        pageKey: "ops/employees/roles",
        promo: false,
        user: req.user,
        roles,
      });
    } catch (error) {
      console.error("EmployeeController.renderRolesPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Manage Roles — Error" },
        pageKey: "ops/employees/roles-error",
        promo: false,
        user: req.user,
        title: "Unable to load Roles Management",
        message: "Something went wrong while loading the Roles Management page.",
        error,
      });
    }
  }

  static async renderEmployeeDetailPage(req, res) {
    const { employeeId } = req.params;
    try {
      const employeeResult = await EmployeeModel.getEmployeeById(employeeId);
      if (!employeeResult.success || !employeeResult.employee) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Employee — Not Found" },
          pageKey: "ops/employees/not-found",
          promo: false,
          user: req.user,
          title: "Employee not found",
          message: "We couldn't find the employee you're looking for.",
          error: { status: 404 },
        });
      }

      const [rolesResult, salaryResult, loansResult, documentsResult] = await Promise.all([
        EmployeeRoleModel.listRoles(),
        EmployeeSalaryPackageModel.getSalaryPackageByEmployeeId(employeeId),
        EmployeeLoanModel.listLoansByEmployeeId(employeeId),
        EmployeeDocumentModel.listDocumentsByEmployeeId(employeeId),
      ]);

      // Fetch repayments for each loan
      const loans = loansResult.success ? loansResult.loans : [];
      const loansWithRepayments = await Promise.all(
        loans.map(async (loan) => {
          const repaymentsResult = await EmployeeLoanRepaymentModel.listRepaymentsByLoanId(loan.id);
          return {
            ...loan,
            repayments: repaymentsResult.success ? repaymentsResult.repayments : [],
          };
        })
      );

      const seo = buildSEO({
        title: `${employeeResult.employee.name || "Employee"} — Employee Management`,
        url: req.path,
      });

      res.render("pages/ops/employees/detail", {
        seo,
        pageKey: "ops/employees/detail",
        promo: false,
        user: req.user,
        employee: employeeResult.employee,
        roles: rolesResult.success ? rolesResult.roles : [],
        salaryPackage: salaryResult.success ? salaryResult.salaryPackage : null,
        loans: loansWithRepayments,
        documents: documentsResult.success ? documentsResult.documents : [],
      });
    } catch (error) {
      console.error("EmployeeController.renderEmployeeDetailPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "Employee Management — Error" },
        pageKey: "ops/employees/error",
        promo: false,
        user: req.user,
        title: "Unable to load employee details",
        message: "Something went wrong while loading the employee details.",
        error,
      });
    }
  }

  // API Routes - Employees
  static async listEmployees(req, res) {
    try {
      const { limit, offset, search, role_id, status } = req.query;
      const result = await EmployeeModel.listEmployees({
        limit: limit ? Number(limit) : 100,
        offset: offset ? Number(offset) : 0,
        search: search || "",
        roleId: role_id ? Number(role_id) : null,
        status: status || null,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        employees: result.employees,
        total: result.total,
      });
    } catch (error) {
      console.error("EmployeeController.listEmployees error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getEmployee(req, res) {
    try {
      const { employeeId } = req.params;
      const result = await EmployeeModel.getEmployeeById(employeeId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error });
      }

      return res.json({ success: true, employee: result.employee });
    } catch (error) {
      console.error("EmployeeController.getEmployee error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async uploadPhoto(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const photoUrl = `/uploads/employees/${req.file.filename}`;
      return res.json({ success: true, photoUrl });
    } catch (error) {
      console.error("EmployeeController.uploadPhoto error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createEmployee(req, res) {
    try {
      const data = { ...req.body };
      
      // If file was uploaded, use the uploaded file path
      if (req.file) {
        data.profile_photo = `/uploads/employees/${req.file.filename}`;
      }

      const result = await EmployeeModel.createEmployee(data);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, employee: result.employee });
    } catch (error) {
      console.error("EmployeeController.createEmployee error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEmployee(req, res) {
    try {
      const { employeeId } = req.params;
      const data = { ...req.body };
      
      // If file was uploaded, use the uploaded file path
      if (req.file) {
        data.profile_photo = `/uploads/employees/${req.file.filename}`;
      }

      const result = await EmployeeModel.updateEmployee(employeeId, data);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, employee: result.employee });
    } catch (error) {
      console.error("EmployeeController.updateEmployee error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteEmployee(req, res) {
    try {
      const { employeeId } = req.params;
      const result = await EmployeeModel.deleteEmployee(employeeId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("EmployeeController.deleteEmployee error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // API Routes - Roles
  static async listRoles(req, res) {
    try {
      const result = await EmployeeRoleModel.listRoles();

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, roles: result.roles });
    } catch (error) {
      console.error("EmployeeController.listRoles error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createRole(req, res) {
    try {
      const result = await EmployeeRoleModel.createRole(req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, role: result.role });
    } catch (error) {
      console.error("EmployeeController.createRole error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRole(req, res) {
    try {
      const { roleId } = req.params;
      const result = await EmployeeRoleModel.updateRole(roleId, req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, role: result.role });
    } catch (error) {
      console.error("EmployeeController.updateRole error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteRole(req, res) {
    try {
      const { roleId } = req.params;
      const result = await EmployeeRoleModel.deleteRole(roleId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("EmployeeController.deleteRole error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // API Routes - Salary Packages
  static async getSalaryPackage(req, res) {
    try {
      const { employeeId } = req.params;
      const result = await EmployeeSalaryPackageModel.getSalaryPackageByEmployeeId(employeeId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, salaryPackage: result.salaryPackage });
    } catch (error) {
      console.error("EmployeeController.getSalaryPackage error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createSalaryPackage(req, res) {
    try {
      const result = await EmployeeSalaryPackageModel.createSalaryPackage(req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, salaryPackage: result.salaryPackage });
    } catch (error) {
      console.error("EmployeeController.createSalaryPackage error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateSalaryPackage(req, res) {
    try {
      const { salaryPackageId } = req.params;
      const result = await EmployeeSalaryPackageModel.updateSalaryPackage(salaryPackageId, req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, salaryPackage: result.salaryPackage });
    } catch (error) {
      console.error("EmployeeController.updateSalaryPackage error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // API Routes - Loans
  static async listLoans(req, res) {
    try {
      const { employeeId } = req.params;
      const result = await EmployeeLoanModel.listLoansByEmployeeId(employeeId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, loans: result.loans });
    } catch (error) {
      console.error("EmployeeController.listLoans error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getLoan(req, res) {
    try {
      const { loanId } = req.params;
      const result = await EmployeeLoanModel.getLoanById(loanId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error });
      }

      return res.json({ success: true, loan: result.loan });
    } catch (error) {
      console.error("EmployeeController.getLoan error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createLoan(req, res) {
    try {
      const result = await EmployeeLoanModel.createLoan(req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, loan: result.loan });
    } catch (error) {
      console.error("EmployeeController.createLoan error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateLoan(req, res) {
    try {
      const { loanId } = req.params;
      const result = await EmployeeLoanModel.updateLoan(loanId, req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, loan: result.loan });
    } catch (error) {
      console.error("EmployeeController.updateLoan error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteLoan(req, res) {
    try {
      const { loanId } = req.params;
      const result = await EmployeeLoanModel.deleteLoan(loanId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("EmployeeController.deleteLoan error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // API Routes - Loan Repayments
  static async listRepayments(req, res) {
    try {
      const { loanId } = req.params;
      const result = await EmployeeLoanRepaymentModel.listRepaymentsByLoanId(loanId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, repayments: result.repayments });
    } catch (error) {
      console.error("EmployeeController.listRepayments error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createRepayment(req, res) {
    try {
      const result = await EmployeeLoanRepaymentModel.createRepayment(req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, repayment: result.repayment });
    } catch (error) {
      console.error("EmployeeController.createRepayment error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRepayment(req, res) {
    try {
      const { repaymentId } = req.params;
      const result = await EmployeeLoanRepaymentModel.updateRepayment(repaymentId, req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, repayment: result.repayment });
    } catch (error) {
      console.error("EmployeeController.updateRepayment error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteRepayment(req, res) {
    try {
      const { repaymentId } = req.params;
      const result = await EmployeeLoanRepaymentModel.deleteRepayment(repaymentId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("EmployeeController.deleteRepayment error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // API Routes - Documents
  static async listDocuments(req, res) {
    try {
      const { employeeId } = req.params;
      const result = await EmployeeDocumentModel.listDocumentsByEmployeeId(employeeId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      return res.json({ success: true, documents: result.documents });
    } catch (error) {
      console.error("EmployeeController.listDocuments error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getDocument(req, res) {
    try {
      const { documentId } = req.params;
      const result = await EmployeeDocumentModel.getDocumentById(documentId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error });
      }

      return res.json({ success: true, document: result.document });
    } catch (error) {
      console.error("EmployeeController.getDocument error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createDocument(req, res) {
    try {
      const { employeeId } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const data = {
        employee_id: employeeId,
        document_type: req.body.document_type || "Other",
        document_name: req.body.document_name || req.file.originalname,
        file_path: `/uploads/employees/documents/${req.file.filename}`,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        expiry_date: req.body.expiry_date || null,
        notes: req.body.notes || null,
      };

      const result = await EmployeeDocumentModel.createDocument(data);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, document: result.document });
    } catch (error) {
      console.error("EmployeeController.createDocument error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateDocument(req, res) {
    try {
      const { documentId } = req.params;
      const result = await EmployeeDocumentModel.updateDocument(documentId, req.body);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true, document: result.document });
    } catch (error) {
      console.error("EmployeeController.updateDocument error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteDocument(req, res) {
    try {
      const { documentId } = req.params;
      const result = await EmployeeDocumentModel.deleteDocument(documentId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("EmployeeController.deleteDocument error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default EmployeeController;

