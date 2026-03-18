import { Router } from "express";
import { documentUpload, handleUploadError } from "../../middleware/documentUpload.js";
import invoiceUpload from "../../middleware/invoiceUpload.js";
import machineUpload from "../../middleware/machineUpload.js";
import { MachineryController } from "./controllers/MachineryController.js";

const router = Router();

// Dashboard
router.get("/", async (req, res) => {
  // Check if user has machinery permissions
  if (req.user.role !== "admin") {
    const { canAccessModule } = await import("../../middleware/rbac.js");
    const hasAccess = await canAccessModule(req.user, "machinery");
    if (!hasAccess) {
      return res.status(403).render("pages/ops/error", {
        seo: { title: "Access Denied" },
        pageKey: "ops/error",
        title: "Access Denied",
        message: "You do not have permission to access machinery management",
        error: { status: 403 },
      });
    }
  }
  return MachineryController.getDashboard(req, res);
});
router.get("/test", (req, res) => {
  res.send("Test route works!");
});

// Simple API endpoint for machine data
router.get("/api/machines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const machine = await MachineryController.getMachineApi(req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Direct API endpoint for edit modal
router.get("/machines/:id/edit-data", async (req, res) => {
  try {
    const { id } = req.params;
    const machine = await MachineryController.getMachineApi(req, res);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Machine Categories
router.get("/categories", MachineryController.getCategories);
router.post("/categories", MachineryController.createCategory);
router.put("/categories/:id", MachineryController.updateCategory);
router.delete("/categories/:id", MachineryController.deleteCategory);

// Machines
router.get("/machines", MachineryController.getMachines);
router.get("/machines/:id/api", MachineryController.getMachineApi);
router.post("/machines", machineUpload.single("machine_image"), MachineryController.createMachine);
router.post("/machines/update", machineUpload.single("machine_image"), MachineryController.updateMachine);
router.put("/machines/:id", machineUpload.single("machine_image"), MachineryController.updateMachine);
router.get("/machines/:id", MachineryController.getMachineDetails);
router.delete("/machines/:id", MachineryController.deleteMachine);

// Service Schedules
router.get("/service-schedules", MachineryController.getServiceSchedules);
router.post("/service-schedules", MachineryController.createServiceSchedule);
router.put("/service-schedules/:id", MachineryController.updateServiceSchedule);
router.delete("/service-schedules/:id", MachineryController.deleteServiceSchedule);
router.get("/service-schedules/:id", MachineryController.getServiceScheduleDetails);

// Service History
router.get("/service-history", MachineryController.getServiceHistory);
router.get("/service-history/:id", MachineryController.getServiceRecordById);
router.post("/service-history", invoiceUpload.single("service_invoice"), MachineryController.createServiceHistory);
router.put("/service-history/:id", invoiceUpload.single("service_invoice"), MachineryController.updateServiceHistory);

// Service Types
router.get("/service-types", MachineryController.getServiceTypes);
router.post("/service-types", MachineryController.createServiceType);
router.post("/service-types/:id/update", MachineryController.updateServiceType);
router.put("/service-types/:id", MachineryController.updateServiceType);
router.delete("/service-types/:id", MachineryController.deleteServiceType);
router.get("/service-types/:id/edit-data", MachineryController.getServiceTypeApi);

// BMC-specific routes
router.get("/bmc-machines", MachineryController.getBmcMachines);

// Issue Management Routes
router.get("/issues", MachineryController.getAllIssues);
router.get("/issues/:issueId", MachineryController.getIssueDetails); // Get individual issue details
router.get("/machines/:id/issues", MachineryController.getMachineIssues);
router.get("/machines/:id/issues/:issueId/edit-data", MachineryController.getIssueEditData);
router.post("/issues", MachineryController.createIssue); // Create issue with machine_id in body
router.post("/machines/:id/issues", MachineryController.createIssue);
router.put("/issues/:issueId", MachineryController.updateIssue); // Update issue by issue ID only
router.put("/machines/:id/issues/:issueId", MachineryController.updateIssue);
router.delete("/machines/:id/issues/:issueId", MachineryController.deleteIssue);
router.get("/issues/:issueId/history", MachineryController.getIssueHistory);

// Document Management Routes
router.post("/machines/documents/upload", documentUpload.single("document"), handleUploadError, MachineryController.uploadDocument);
router.get("/machines/:id/documents", MachineryController.getMachineDocuments);
router.put("/documents/:id", MachineryController.updateDocument);
router.delete("/documents/:id", MachineryController.deleteDocument);
router.get("/documents/:id/download", MachineryController.downloadDocument);
router.get("/documents/:id/preview", MachineryController.previewDocument);

export default router;
