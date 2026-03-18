import emailService from "../../../services/emailService.js";
import { buildSEO } from "../../../utils/seo.js";
import { MachineBmcModel } from "../models/MachineBmcModel.js";
import { MachineCategoryModel } from "../models/MachineCategoryModel.js";
import MachineDocumentModel from "../models/MachineDocumentModel.js";
import { MachineIssueHistoryModel } from "../models/MachineIssueHistoryModel.js";
import { MachineIssueModel } from "../models/MachineIssueModel.js";
import { MachineModel } from "../models/MachineModel.js";
import { ServiceModel } from "../models/ServiceModel.js";

export class MachineryController {
  // Dashboard - Overview of machinery management
  static async getDashboard(req, res) {
    try {
      // Get machine statistics
      const machineStats = await MachineModel.getMachineStats();

      // Get top machines for dashboard
      const topMachines = await MachineModel.getTopMachines(5);

      // Get active issues for dashboard
      const activeIssues = await MachineIssueModel.getActiveIssuesDashboard(5);

      // Get category statistics
      const categoryStats = await MachineCategoryModel.getCategoryStats();

      // Get upcoming services
      const upcomingServices = await ServiceModel.getUpcomingServicesDashboard(5);

      // Get overdue services
      const overdueServices = await ServiceModel.getOverdueServices(5);

      // Get issue statistics
      const issueStats = await MachineIssueModel.getIssueStats();
      const pendingIssues = await MachineIssueModel.getPendingIssues();
      const issuesByMachine = await MachineIssueModel.getIssuesCountByMachine();

      const seo = buildSEO({ title: "Machinery Management Dashboard", url: req.path });
      res.render("pages/ops/machinery/dashboard", {
        seo,
        pageKey: "ops/machinery/dashboard",
        title: "Machinery Management Dashboard",
        user: req.user,
        machineStats: machineStats.rows || {},
        categoryStats: categoryStats.rows || [],
        upcomingServices: upcomingServices.rows || [],
        overdueServices: overdueServices.rows || [],
        issueStats: issueStats.rows || {},
        pendingIssues: pendingIssues.rows || [],
        issuesByMachine: issuesByMachine.rows || [],
        topMachines: topMachines.rows || [],
        activeIssues: activeIssues.rows || [],
        section: "Admin",
        subsection: "Machines",
      });
    } catch (error) {
      console.error("Error in machinery dashboard:", error);
      const seo = buildSEO({ title: "Machinery Management Dashboard", url: req.path });
      res.status(500).render("pages/ops/machinery/dashboard", {
        seo,
        pageKey: "ops/machinery/dashboard",
        title: "Machinery Management Dashboard",
        user: req.user,
        machineStats: {},
        categoryStats: [],
        upcomingServices: [],
        overdueServices: [],
        issueStats: {},
        pendingIssues: [],
        issuesByMachine: [],
        topMachines: [],
        activeIssues: [],
        section: "Admin",
        subsection: "Machines",
        error: "Failed to load dashboard data",
      });
    }
  }

  // Machine Categories Management
  static async getCategories(req, res) {
    try {
      const categories = await MachineCategoryModel.getAllCategories();

      const seo = buildSEO({ title: "Machine Categories", url: req.path });
      res.render("pages/ops/machinery/categories", {
        seo,
        pageKey: "ops/machinery/categories",
        title: "Machine Categories",
        categories: categories.rows || [],
        section: "Admin",
        subsection: "Machines",
        user: req.user,
      });
    } catch (error) {
      console.error("Error loading machine categories:", error);
      const seo = buildSEO({ title: "Machine Categories", url: req.path });
      res.status(500).render("pages/ops/machinery/categories", {
        seo,
        pageKey: "ops/machinery/categories",
        title: "Machine Categories",
        categories: [],
        error: "Failed to load categories",
        section: "Admin",
        subsection: "Machines",
        user: req.user,
      });
    }
  }

  // Create Category
  static async createCategory(req, res) {
    try {
      const result = await MachineCategoryModel.createCategory(req.body);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Category created successfully",
        };
        res.redirect("/machinery/categories");
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to create category",
        };
        res.redirect("/machinery/categories");
      }
    } catch (error) {
      console.error("Error creating category:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to create category",
      };
      res.redirect("/machinery/categories");
    }
  }

  // Update Category
  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await MachineCategoryModel.updateCategory(id, req.body);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Category updated successfully",
        };
        res.redirect("/machinery/categories");
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to update category",
        };
        res.redirect("/machinery/categories");
      }
    } catch (error) {
      console.error("Error updating category:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to update category",
      };
      res.redirect("/machinery/categories");
    }
  }

  // Delete Category
  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await MachineCategoryModel.deleteCategory(id);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Category deleted successfully",
        };
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to delete category",
        };
      }
      res.redirect("/machinery/categories");
    } catch (error) {
      console.error("Error deleting category:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to delete category",
      };
      res.redirect("/machinery/categories");
    }
  }

  // Machines Management
  static async getMachines(req, res) {
    try {
      const { category_id, status, location } = req.query;
      const filters = { category_id, status, location };

      const machines = await MachineModel.getAllMachines(filters);
      const allMachines = await MachineModel.getAllMachines({}); // Get all machines for category tabs
      const categories = await MachineCategoryModel.getAllCategories();
      // Get actual issues data for machines with open issues
      const allIssues = await MachineIssueModel.getAllIssues();
      const openIssues = allIssues.rows.filter((issue) => issue.status === "open" || issue.status === "in_progress");

      // Group issues by machine
      const issuesByMachine = {};
      openIssues.forEach((issue) => {
        if (!issuesByMachine[issue.machine_id]) {
          issuesByMachine[issue.machine_id] = [];
        }
        issuesByMachine[issue.machine_id].push(issue);
      });

      const seo = buildSEO({ title: "Machines", url: req.path });
      res.render("pages/ops/machinery/machines", {
        seo,
        pageKey: "ops/machinery/machines",
        title: "Machines",
        machines: machines.rows || [],
        allMachines: allMachines.rows || [],
        categories: categories.rows || [],
        issuesByMachine: issuesByMachine,
        filters: { category_id, status, location },
        section: "Admin",
        subsection: "Machines",
        user: req.user,
      });
    } catch (error) {
      console.error("Error loading machines:", error);
      const seo = buildSEO({ title: "Machines", url: req.path });
      res.status(500).render("pages/ops/machinery/machines", {
        seo,
        pageKey: "ops/machinery/machines",
        title: "Machines",
        machines: [],
        categories: [],
        issuesByMachine: [],
        filters: {},
        error: "Failed to load machines",
        section: "Admin",
        subsection: "Machines",
        user: req.user,
      });
    }
  }

  // Get Machine API (JSON)
  static async getMachineApi(req, res) {
    try {
      const { id } = req.params;

      const machine = await MachineModel.getMachineById(id);
      const upcomingServices = await MachineModel.getUpcomingServices(id, 5);
      const serviceHistory = await MachineModel.getServiceHistory(id, 10);

      if (!machine.rows) {
        return res.status(404).json({
          success: false,
          error: "Machine not found",
        });
      }

      // Check if this is a BMC machine and get BMC details
      let bmcDetails = null;
      const isBmcCheck = await MachineBmcModel.isBmcMachine(id);
      if (isBmcCheck.success && isBmcCheck.isBmc) {
        const bmcResult = await MachineBmcModel.getBmcDetails(id);
        bmcDetails = bmcResult.rows;
      }

      return res.json({
        success: true,
        machine: machine.rows,
        bmcDetails: bmcDetails,
        upcomingServices: upcomingServices.rows || [],
        serviceHistory: serviceHistory.rows || [],
      });
    } catch (error) {
      console.error("Error loading machine API:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to load machine data",
      });
    }
  }

  // Get Machine Details
  static async getMachineDetails(req, res) {
    try {
      const { id } = req.params;

      const machine = await MachineModel.getMachineById(id);
      const upcomingServices = await MachineModel.getUpcomingServices(id, 5);
      const serviceHistory = await MachineModel.getServiceHistory(id, 10);
      const serviceSchedules = await ServiceModel.getServiceSchedules({ machine_id: id });
      const categories = await MachineCategoryModel.getAllCategories();
      const issues = await MachineIssueModel.getIssuesByMachine(id);

      if (!machine.rows) {
        if (req.headers.accept && req.headers.accept.includes("application/json")) {
          return res.status(404).json({
            success: false,
            error: "Machine not found",
          });
        }
        req.session.toast = {
          type: "error",
          message: "Machine not found",
        };
        return res.redirect("/machinery/machines");
      }

      // Check if this is a BMC machine and get BMC details
      let bmcDetails = null;
      const isBmcCheck = await MachineBmcModel.isBmcMachine(id);
      if (isBmcCheck.success && isBmcCheck.isBmc) {
        const bmcResult = await MachineBmcModel.getBmcDetails(id);
        bmcDetails = bmcResult.rows;
      }

      // Check if this is a JSON request (for edit modal)
      if (req.query.format === "json" || req.query.edit === "true" || (req.headers.accept && req.headers.accept.includes("application/json"))) {
        return res.json({
          success: true,
          machine: machine.rows,
          bmcDetails: bmcDetails,
          categories: categories.rows || [],
        });
      }

      // Get toast message and clear it from session before rendering
      const toast = req.session.toast;
      if (req.session.toast) {
        delete req.session.toast;
      }

      const seo = buildSEO({ title: `Machine: ${machine.rows.name}`, url: req.path });
      res.render("pages/ops/machinery/machine-details", {
        seo,
        pageKey: "ops/machinery/machine-details",
        title: `Machine: ${machine.rows.name}`,
        user: req.user,
        machine: machine.rows,
        bmcDetails: bmcDetails,
        categories: categories.rows || [],
        upcomingServices: upcomingServices.rows || [],
        serviceHistory: serviceHistory.rows || [],
        serviceSchedules: serviceSchedules.rows || [],
        issues: issues.rows || [],
        toast: toast,
      });
    } catch (error) {
      console.error("Error loading machine details:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to load machine details",
        };
      }
      res.redirect("/machinery/machines");
    }
  }

  // Get Edit Machine Page
  static async getEditMachine(req, res) {
    try {
      const { id } = req.params;

      // Get machine details
      const machine = await MachineModel.getMachineById(id);
      if (!machine.success || !machine.rows) {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Machine not found",
          };
        }
        return res.redirect("/machinery/machines");
      }

      // Get categories for the form
      const categories = await MachineCategoryModel.getAllCategories();

      // Check if this is a BMC machine and get BMC details
      let bmcDetails = null;
      const isBmcCheck = await MachineBmcModel.isBmcMachine(id);
      if (isBmcCheck.success && isBmcCheck.isBmc) {
        const bmcResult = await MachineBmcModel.getBmcDetails(id);
        bmcDetails = bmcResult.rows;
      }

      const seo = buildSEO({ title: `Edit Machine: ${machine.rows.name}`, url: req.path });
      res.render("pages/ops/machinery/edit-machine", {
        seo,
        pageKey: "ops/machinery/edit-machine",
        title: `Edit Machine: ${machine.rows.name}`,
        machine: machine.rows,
        categories: categories.rows || [],
        bmcDetails: bmcDetails,
      });
    } catch (error) {
      console.error("Error loading edit machine page:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to load edit page",
        };
      }
      res.redirect("/machinery/machines");
    }
  }

  // Get Machine API (for edit modal)
  static async getMachineApi(req, res) {
    try {
      const { id } = req.params;

      // Get machine details
      const machine = await MachineModel.getMachineById(id);
      if (!machine.success || !machine.rows) {
        return res.status(404).json({
          success: false,
          error: "Machine not found",
        });
      }

      // Check if this is a BMC machine and get BMC details
      let bmcDetails = null;
      const isBmcCheck = await MachineBmcModel.isBmcMachine(id);
      if (isBmcCheck.success && isBmcCheck.isBmc) {
        const bmcResult = await MachineBmcModel.getBmcDetails(id);
        bmcDetails = bmcResult.rows;
      }

      res.json({
        success: true,
        machine: machine.rows,
        bmcDetails: bmcDetails,
      });
    } catch (error) {
      console.error("Error loading machine API:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load machine data",
      });
    }
  }

  // Create Machine
  static async createMachine(req, res) {
    try {
      // Handle image upload
      let imageData = null;
      if (req.file) {
        imageData = {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: `/uploads/machines/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };
      }

      // Add image data to request body
      const machineData = {
        ...req.body,
        images: imageData ? JSON.stringify([imageData]) : null,
      };

      const result = await MachineModel.createMachine(machineData);

      if (result.success) {
        // Check if this is a BMC machine and create BMC details
        const isBmcCheck = await MachineBmcModel.isBmcMachine(result.id);
        if (isBmcCheck.success && isBmcCheck.isBmc) {
          const bmcData = {
            capacity: req.body.capacity,
            power: req.body.power,
            voltage: req.body.voltage,
            cooling_temperature: req.body.cooling_temperature,
            compressor_type: req.body.compressor_type,
            refrigerant_type: req.body.refrigerant_type,
            insulation_thickness: req.body.insulation_thickness,
          };

          const bmcResult = await MachineBmcModel.createBmcDetails(result.id, bmcData);
          if (!bmcResult.success) {
            console.error("Error creating BMC details:", bmcResult.error);
          }
        }

        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Machine created successfully",
          };
        }
        res.redirect("/machinery/machines");
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to create machine",
          };
        }
        res.redirect("/machinery/machines");
      }
    } catch (error) {
      console.error("Error creating machine:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to create machine",
        };
      }
      res.redirect("/machinery/machines");
    }
  }

  // Update Machine
  static async updateMachine(req, res) {
    try {
      // Get machine ID from either URL params (PUT) or form data (POST)
      const id = req.params.id || req.body.machine_id;
      console.log("Machine ID:", id);

      // Handle image upload
      let imageData = null;
      if (req.file) {
        imageData = {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: `/uploads/machines/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };
      }

      // Get existing machine data to preserve existing images and category if no new data provided
      let existingImages = null;
      let existingCategoryId = null;
      if (!req.file || !req.body.category_id) {
        const existingMachine = await MachineModel.getMachineById(id);
        if (existingMachine.success && existingMachine.rows) {
          if (!req.file && existingMachine.rows.images) {
            existingImages = existingMachine.rows.images;
          }
          if (!req.body.category_id && existingMachine.rows.category_id) {
            existingCategoryId = existingMachine.rows.category_id;
          }
        }
      }

      // Add image data and ensure category_id is present
      const machineData = {
        ...req.body,
        images: imageData ? JSON.stringify([imageData]) : existingImages,
        category_id: req.body.category_id || existingCategoryId,
      };

      const result = await MachineModel.updateMachine(id, machineData);

      if (result.success) {
        // Check if this is a BMC machine and update BMC details
        const isBmcCheck = await MachineBmcModel.isBmcMachine(id);
        if (isBmcCheck.success && isBmcCheck.isBmc) {
          const bmcData = {
            capacity: req.body.capacity || null,
            power: req.body.power_kw || null,
            voltage: req.body.voltage_v || null,
            cooling_temperature: req.body.cooling_temperature || null,
            compressor_type: req.body.compressor_type || null,
            refrigerant_type: req.body.refrigerant_type || null,
            insulation_thickness: req.body.insulation_thickness || null,
          };

          const bmcResult = await MachineBmcModel.updateBmcDetails(id, bmcData);
          if (!bmcResult.success) {
            console.error("Error updating BMC details:", bmcResult.error);
          }
        }

        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Machine updated successfully",
          };
        }
        res.redirect(`/ops/machinery/machines/${id}`);
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to update machine",
          };
        }
        res.redirect(`/ops/machinery/machines/${id}`);
      }
    } catch (error) {
      console.error("Error updating machine:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to update machine",
        };
      }
      res.redirect(`/ops/machinery/machines/${id}`);
    }
  }

  // Delete Machine
  static async deleteMachine(req, res) {
    try {
      const { id } = req.params;
      const result = await MachineModel.deleteMachine(id);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Machine deleted successfully",
        };
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to delete machine",
        };
      }

      // Check if it's an AJAX request
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf("json") > -1)) {
        // Return JSON for AJAX requests
        return res.json({
          success: result.success,
          message: result.success ? "Machine deleted successfully" : result.error || "Failed to delete machine",
        });
      } else {
        // Redirect for form submissions
        res.redirect("/machinery/machines");
      }
    } catch (error) {
      console.error("Error deleting machine:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to delete machine",
      };

      // Check if it's an AJAX request
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf("json") > -1)) {
        // Return JSON for AJAX requests
        return res.json({
          success: false,
          message: "Failed to delete machine",
        });
      } else {
        // Redirect for form submissions
        res.redirect("/machinery/machines");
      }
    }
  }

  // Service Schedules Management
  static async getServiceSchedules(req, res) {
    try {
      const { machine_id, overdue_only } = req.query;
      const filters = { machine_id, overdue_only: overdue_only === "true" };

      const schedules = await ServiceModel.getServiceSchedules(filters);
      const machines = await MachineModel.getAllMachines();
      const serviceTypes = await ServiceModel.getAllServiceTypes();

      // Get machine name if machine_id is provided
      let machineName = null;
      if (machine_id) {
        const machine = await MachineModel.getMachineById(machine_id);
        if (machine.success && machine.rows) {
          machineName = machine.rows.name;
        }
      }

      // Set page title based on whether we're filtering by machine
      const pageTitle = machineName ? `Service Schedules - ${machineName}` : "Service Schedules";
      const seo = buildSEO({ title: pageTitle, url: req.path });

      res.render("pages/ops/machinery/service-schedules", {
        seo,
        pageKey: "ops/machinery/service-schedules",
        title: pageTitle,
        schedules: schedules.rows || [],
        machines: machines.rows || [],
        serviceTypes: serviceTypes.rows || [],
        filters: { machine_id, overdue_only },
        machineName: machineName,
      });
    } catch (error) {
      console.error("Error loading service schedules:", error);
      const seo = buildSEO({ title: "Service Schedules", url: req.path });
      res.status(500).render("pages/ops/machinery/service-schedules", {
        seo,
        pageKey: "ops/machinery/service-schedules",
        title: "Service Schedules",
        schedules: [],
        machines: [],
        serviceTypes: [],
        filters: {},
        machineName: null,
        error: "Failed to load service schedules",
      });
    }
  }

  // Create Service Schedule
  static async createServiceSchedule(req, res) {
    try {
      const result = await ServiceModel.createServiceSchedule(req.body);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Service schedule created successfully",
        };
        res.redirect("/machinery/service-schedules");
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to create service schedule",
        };
        res.redirect("/machinery/service-schedules");
      }
    } catch (error) {
      console.error("Error creating service schedule:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to create service schedule",
      };
      res.redirect("/machinery/service-schedules");
    }
  }

  // Get Service Schedule Details
  static async getServiceScheduleDetails(req, res) {
    try {
      const { id } = req.params;

      const result = await ServiceModel.getServiceScheduleById(id);

      if (!result.success) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Service Schedule Not Found" },
          pageKey: "ops/error",
          title: "Service Schedule Not Found",
          message: result.error || "The requested service schedule could not be found",
          error: { status: 404 },
        });
      }

      const schedule = result.schedule;

      // Get related service history for this schedule
      const serviceHistory = await ServiceModel.getServiceHistory({
        machine_id: schedule.machine_id,
        service_type_id: schedule.service_type_id,
        limit: 10,
      });

      const seo = buildSEO({ title: `Service Schedule Details - ${schedule.service_type_name || "Service"}` });
      res.render("pages/ops/machinery/service-schedule-details", {
        seo,
        pageKey: "ops/machinery/service-schedule-details",
        title: `Service Schedule Details - ${schedule.service_type_name || "Service"}`,
        user: req.user,
        schedule,
        serviceHistory: serviceHistory.rows || [],
      });
    } catch (error) {
      console.error("Error in getServiceScheduleDetails:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Error - Service Schedule Details" },
        pageKey: "ops/error",
        title: "Service Schedule Details Error",
        message: "Failed to load service schedule details",
        error: { status: 500, message: error.message },
      });
    }
  }

  // Update Service Schedule
  static async updateServiceSchedule(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Map frontend frequency to database enum values
      const frequencyMapping = {
        daily: { type: "daily", unit: "days" },
        weekly: { type: "weekly", unit: "weeks" },
        monthly: { type: "monthly", unit: "months" },
        quarterly: { type: "quarterly", unit: "months" },
        "semi-annually": { type: "yearly", unit: "months" },
        annually: { type: "yearly", unit: "years" },
      };

      const frequency = updateData.frequency_unit || "monthly";
      const freqConfig = frequencyMapping[frequency] || frequencyMapping["monthly"];

      // Get the existing schedule to preserve machine_id and service_type_id
      const existingSchedule = await ServiceModel.getServiceScheduleById(id);
      if (!existingSchedule.success) {
        return res.status(404).json({ success: false, message: "Service schedule not found" });
      }

      // Map frontend fields to database fields
      const mappedData = {
        machine_id: existingSchedule.schedule.machine_id,
        service_type_id: existingSchedule.schedule.service_type_id,
        frequency_type: freqConfig.type,
        frequency_value: 1, // Default value
        frequency_unit: freqConfig.unit,
        next_service_date: updateData.next_service_date || null,
        last_service_date: updateData.last_service_date || null,
        notes: updateData.notes || null,
      };

      // Ensure no undefined values
      Object.keys(mappedData).forEach((key) => {
        if (mappedData[key] === undefined) {
          mappedData[key] = null;
        }
      });

      const result = await ServiceModel.updateServiceSchedule(id, mappedData);

      if (result.success) {
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.json({
            success: true,
            message: "Service schedule updated successfully",
          });
        } else {
          if (req.session) {
            req.session.toast = {
              type: "success",
              message: "Service schedule updated successfully",
            };
          }
          res.redirect(`/ops/machinery/service-schedules/${id}`);
        }
      } else {
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.status(400).json({
            success: false,
            message: result.error || "Failed to update service schedule",
          });
        } else {
          if (req.session) {
            req.session.toast = {
              type: "error",
              message: result.error || "Failed to update service schedule",
            };
          }
          res.redirect(`/ops/machinery/service-schedules/${id}`);
        }
      }
    } catch (error) {
      console.error("Error updating service schedule:", error);
      if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
        return res.status(500).json({
          success: false,
          message: "Failed to update service schedule",
        });
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Failed to update service schedule",
          };
        }
        res.redirect(`/ops/machinery/service-schedules/${req.params.id}`);
      }
    }
  }

  // Delete Service Schedule
  static async deleteServiceSchedule(req, res) {
    try {
      const { id } = req.params;

      const result = await ServiceModel.deleteServiceSchedule(id);

      if (result.success) {
        // Always return JSON for DELETE requests
        return res.json({
          success: true,
          message: "Service schedule deleted successfully",
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.error || "Failed to delete service schedule",
        });
      }
    } catch (error) {
      console.error("Error deleting service schedule:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete service schedule",
      });
    }
  }

  // Service History Management
  static async getServiceHistory(req, res) {
    try {
      const { machine_id, service_type_id, start_date, end_date } = req.query;
      const filters = { machine_id, service_type_id, start_date, end_date };

      const history = await ServiceModel.getServiceHistory(filters);
      const machines = await MachineModel.getAllMachines();
      const serviceTypes = await ServiceModel.getAllServiceTypes();

      const seo = buildSEO({ title: "Service History", url: req.path });
      res.render("pages/ops/machinery/service-history", {
        seo,
        pageKey: "ops/machinery/service-history",
        title: "Service History",
        user: req.user,
        history: history.rows || [],
        machines: machines.rows || [],
        serviceTypes: serviceTypes.rows || [],
        filters: { machine_id, service_type_id, start_date, end_date },
        toast: req.session?.toast || null,
      });

      // Clear the toast after displaying it
      if (req.session?.toast) {
        delete req.session.toast;
      }
    } catch (error) {
      console.error("Error loading service history:", error);
      const seo = buildSEO({ title: "Service History", url: req.path });
      res.status(500).render("pages/ops/machinery/service-history", {
        seo,
        pageKey: "ops/machinery/service-history",
        title: "Service History",
        user: req.user,
        history: [],
        machines: [],
        serviceTypes: [],
        filters: {},
        error: "Failed to load service history",
        toast: null,
      });
    }
  }

  // Create Service History Record
  static async createServiceHistory(req, res) {
    try {
      // Handle invoice file upload
      let invoiceData = null;
      if (req.file) {
        invoiceData = {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: `/uploads/invoices/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };
      }

      // Handle service_type string - convert to service_type_id if needed
      let service_type_id = req.body.service_type_id;
      if (!service_type_id && req.body.service_type) {
        // Try to find existing service type by name
        const serviceTypes = await ServiceModel.getAllServiceTypes();
        const existingType = serviceTypes.rows.find((st) => st.name.toLowerCase() === req.body.service_type.toLowerCase());
        if (existingType) {
          service_type_id = existingType.id;
        } else {
          // Create new service type if it doesn't exist
          const newType = await ServiceModel.createServiceType({
            name: req.body.service_type,
            description: req.body.description || "",
            category_id: null, // Default category_id
            estimated_cost: req.body.cost || 0,
            estimated_duration_hours: req.body.duration_hours || 0,
          });
          if (newType.success) {
            service_type_id = newType.id;
          } else {
            // Fallback to default service type (General Maintenance)
            service_type_id = 15;
          }
        }
      }

      // Add invoice data to request body
      const serviceData = {
        ...req.body,
        service_type_id: service_type_id,
        service_provider: req.body.service_provider || "Vrindavan Farm",
        labor_hours: req.body.duration_hours || req.body.labor_hours,
        total_cost: req.body.cost || req.body.total_cost,
        parts_used: req.body.parts_used || JSON.stringify([]),
        images: req.body.images || JSON.stringify([]),
        invoice_file: invoiceData ? JSON.stringify(invoiceData) : null,
        // Fix empty date fields - convert empty strings to null
        next_service_due: req.body.next_service_due && req.body.next_service_due.trim() !== "" ? req.body.next_service_due : null,
        service_date: req.body.service_date && req.body.service_date.trim() !== "" ? req.body.service_date : null,
      };

      const result = await ServiceModel.createServiceHistory(serviceData);

      if (result.success) {
        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Service record created successfully",
          };
        }
        res.redirect("/machinery/service-history");
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to create service record",
          };
        }
        res.redirect("/machinery/service-history");
      }
    } catch (error) {
      console.error("Error creating service history:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to create service record",
        };
      }
      res.redirect("/machinery/service-history");
    }
  }

  // Get Service Record by ID
  static async getServiceRecordById(req, res) {
    try {
      const { id } = req.params;
      const result = await ServiceModel.getServiceRecordById(id);

      if (!result.success || !result.record) {
        if (req.headers.accept && req.headers.accept.includes("application/json")) {
          return res.status(404).json({
            success: false,
            error: "Service record not found",
          });
        }
        req.session.toast = {
          type: "error",
          message: "Service record not found",
        };
        return res.redirect("/machinery/service-history");
      }

      const seo = buildSEO({
        title: `Service Record #${result.record.id}`,
        url: req.path,
      });

      res.render("pages/ops/machinery/service-record-details", {
        seo,
        pageKey: "ops/machinery/service-record-details",
        title: `Service Record #${result.record.id}`,
        user: req.user,
        record: result.record,
        toast: req.session.toast,
      });
    } catch (error) {
      console.error("Error fetching service record:", error);
      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch service record",
        });
      }
      req.session.toast = {
        type: "error",
        message: "Failed to fetch service record",
      };
      res.redirect("/machinery/service-history");
    }
  }

  // Update Service History Record
  static async updateServiceHistory(req, res) {
    try {
      const { id } = req.params;

      // Handle invoice file upload
      let invoiceData = null;
      if (req.file) {
        invoiceData = {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: `/uploads/invoices/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };
      }

      // Add invoice data to request body
      const serviceData = {
        ...req.body,
        parts_used: req.body.parts_used || JSON.stringify([]),
        images: req.body.images || JSON.stringify([]),
        invoice_file: invoiceData ? JSON.stringify(invoiceData) : null,
        // Fix empty date fields - convert empty strings to null
        next_service_due: req.body.next_service_due && req.body.next_service_due.trim() !== "" ? req.body.next_service_due : null,
        service_date: req.body.service_date && req.body.service_date.trim() !== "" ? req.body.service_date : null,
      };

      const result = await ServiceModel.updateServiceHistory(id, serviceData);

      if (result.success) {
        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Service record updated successfully",
          };
        }
        res.redirect("/machinery/service-history");
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to update service record",
          };
        }
        res.redirect("/machinery/service-history");
      }
    } catch (error) {
      console.error("Error updating service history:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to update service record",
        };
      }
      res.redirect("/machinery/service-history");
    }
  }

  // Service Types Management
  static async getServiceTypes(req, res) {
    try {
      const serviceTypes = await ServiceModel.getAllServiceTypes();
      const categories = await MachineCategoryModel.getAllCategories();

      const seo = buildSEO({ title: "Service Types", url: req.path });
      res.render("pages/ops/machinery/service-types", {
        seo,
        pageKey: "ops/machinery/service-types",
        title: "Service Types",
        serviceTypes: serviceTypes.rows || [],
        categories: categories.rows || [],
        section: "Admin",
        subsection: "Machines",
        user: req.user,
      });
    } catch (error) {
      console.error("Error loading service types:", error);
      const seo = buildSEO({ title: "Service Types", url: req.path });
      res.status(500).render("pages/ops/machinery/service-types", {
        seo,
        pageKey: "ops/machinery/service-types",
        title: "Service Types",
        serviceTypes: [],
        categories: [],
        error: "Failed to load service types",
        section: "Admin",
        subsection: "Machines",
        user: req.user,
      });
    }
  }

  // Create Service Type
  static async createServiceType(req, res) {
    try {
      const result = await ServiceModel.createServiceType(req.body);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Service type created successfully",
        };
        res.redirect("/machinery/service-types");
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to create service type",
        };
        res.redirect("/machinery/service-types");
      }
    } catch (error) {
      console.error("Error creating service type:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to create service type",
      };
      res.redirect("/machinery/service-types");
    }
  }

  // Update Service Type
  static async updateServiceType(req, res) {
    try {
      const { id } = req.params;
      const result = await ServiceModel.updateServiceType(id, req.body);

      if (result.success) {
        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Service type updated successfully",
          };
        }
        res.redirect("/machinery/service-types");
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to update service type",
          };
        }
        res.redirect("/machinery/service-types");
      }
    } catch (error) {
      console.error("Error updating service type:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to update service type",
        };
      }
      res.redirect("/machinery/service-types");
    }
  }

  // Get Service Type API (for edit modal)
  static async getServiceTypeApi(req, res) {
    try {
      console.log("getServiceTypeApi called with id:", req.params.id);
      const { id } = req.params;
      const serviceType = await ServiceModel.getServiceTypeById(id);

      if (serviceType.success && serviceType.rows) {
        res.json({
          success: true,
          data: serviceType.rows,
        });
      } else {
        res.status(404).json({
          success: false,
          error: "Service type not found",
        });
      }
    } catch (error) {
      console.error("Error fetching service type:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch service type",
      });
    }
  }

  // Delete Service Type
  static async deleteServiceType(req, res) {
    try {
      const { id } = req.params;
      const result = await ServiceModel.deleteServiceType(id);

      if (result.success) {
        req.session.toast = {
          type: "success",
          message: "Service type deleted successfully",
        };
      } else {
        req.session.toast = {
          type: "error",
          message: result.error || "Failed to delete service type",
        };
      }
      res.redirect("/machinery/service-types");
    } catch (error) {
      console.error("Error deleting service type:", error);
      req.session.toast = {
        type: "error",
        message: "Failed to delete service type",
      };
      res.redirect("/machinery/service-types");
    }
  }

  // BMC-specific methods
  static async getBmcMachines(req, res) {
    try {
      const bmcMachines = await MachineBmcModel.getAllBmcMachines();
      const bmcStats = await MachineBmcModel.getBmcStats();

      const seo = buildSEO({ title: "BMC Machines", url: req.path });
      res.render("pages/ops/machinery/bmc-machines", {
        seo,
        pageKey: "ops/machinery/bmc-machines",
        title: "BMC Machines",
        bmcMachines: bmcMachines.rows || [],
        bmcStats: bmcStats.rows || {},
      });
    } catch (error) {
      console.error("Error loading BMC machines:", error);
      const seo = buildSEO({ title: "BMC Machines", url: req.path });
      res.status(500).render("pages/ops/machinery/bmc-machines", {
        seo,
        pageKey: "ops/machinery/bmc-machines",
        title: "BMC Machines",
        bmcMachines: [],
        bmcStats: {},
        error: "Failed to load BMC machines",
      });
    }
  }

  // Issue Management Methods
  static async getMachineIssues(req, res) {
    try {
      const { id } = req.params;
      const { status, priority } = req.query;

      const issues = await MachineIssueModel.getIssuesByMachine(id);
      const machine = await MachineModel.getMachineById(id);

      if (!machine.success || !machine.rows) {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Machine not found",
          };
        }
        return res.redirect("/machinery/machines");
      }

      // Filter issues if status or priority specified
      let filteredIssues = issues.rows || [];
      if (status) {
        filteredIssues = filteredIssues.filter((issue) => issue.status === status);
      }
      if (priority) {
        filteredIssues = filteredIssues.filter((issue) => issue.priority === priority);
      }

      const seo = buildSEO({ title: `Issues - ${machine.rows.name}`, url: req.path });
      res.render("pages/ops/machinery/machine-issues", {
        seo,
        pageKey: "ops/machinery/machine-issues",
        title: `Issues - ${machine.rows.name}`,
        machine: machine.rows,
        issues: filteredIssues,
        filters: { status, priority },
      });
    } catch (error) {
      console.error("Error loading machine issues:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to load issues",
        };
      }
      res.redirect("/machinery/machines");
    }
  }

  static async createIssue(req, res) {
    try {
      // Get machine_id from either URL params or request body
      const machineId = req.params.id || req.body.machine_id;

      if (!machineId) {
        return res.status(400).json({
          success: false,
          message: "Machine ID is required",
        });
      }

      const issueData = {
        ...req.body,
        machine_id: machineId,
        reported_by: req.body.reported_by || "System User",
        issue_type: req.body.category || req.body.issue_type || "other", // Map category to issue_type
      };

      const result = await MachineIssueModel.createIssue(issueData);

      if (result.success) {
        // Add initial history entry
        await MachineIssueHistoryModel.addHistoryEntry({
          issue_id: result.id,
          field_name: "created",
          old_value: null,
          new_value: "Issue created",
          changed_by: issueData.reported_by,
          change_reason: "Issue reported",
        });

        // Send issue alert email if enabled (async, non-blocking)
        if (emailService.settings.issue_alert_enabled) {
          // Send email in background without blocking the response
          setImmediate(async () => {
            try {
              // Get machine details for the email
              const machineResult = await MachineModel.getMachineById(machineId);
              const machine = machineResult.success ? machineResult.rows : null;

              const issueDataForEmail = {
                machine_name: machine ? machine.name : "Unknown Machine",
                serial_number: machine ? machine.serial_number : "N/A",
                issue_type: issueData.issue_type || "General Issue",
                severity: issueData.priority || "medium",
                description: issueData.description || "No description provided",
                reported_by: issueData.reported_by || "System User",
                reported_at: new Date().toLocaleString(),
                location: machine ? machine.location : "N/A",
              };

              const emailResult = await emailService.sendIssueAlertEmail(issueDataForEmail);
              if (emailResult.success) {
                console.log(`Issue alert email sent for issue ${result.id}`);
              } else {
                console.error(`Failed to send issue alert email: ${emailResult.error}`);
              }
            } catch (emailError) {
              console.error("Error sending issue alert email:", emailError);
            }
          });
        }

        // Check if this is an API call (JSON request) or web form submission
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          // API call - return JSON response
          res.json({
            success: true,
            message: "Issue reported successfully",
            issue_id: result.id,
          });
        } else {
          // Web form submission - redirect with session message
          if (req.session) {
            req.session.toast = {
              type: "success",
              message: "Issue reported successfully",
            };
          }
          res.redirect(`/ops/machinery/machines/${machineId}/issues`);
        }
      } else {
        // Check if this is an API call (JSON request) or web form submission
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          // API call - return JSON response
          res.status(400).json({
            success: false,
            message: result.error || "Failed to report issue",
          });
        } else {
          // Web form submission - redirect with session message
          if (req.session) {
            req.session.toast = {
              type: "error",
              message: result.error || "Failed to report issue",
            };
          }
          res.redirect(`/ops/machinery/machines/${machineId}/issues`);
        }
      }
    } catch (error) {
      console.error("Error creating issue:", error);

      // Check if this is an API call (JSON request) or web form submission
      if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
        // API call - return JSON response
        res.status(500).json({
          success: false,
          message: "Failed to report issue",
        });
      } else {
        // Web form submission - redirect with session message
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Failed to report issue",
          };
        }
        res.redirect(`/ops/machinery/machines/${machineId}/issues`);
      }
    }
  }

  static async updateIssue(req, res) {
    try {
      const { id, issueId } = req.params;
      const updateData = req.body;
      const changedBy = req.body.changed_by || req.user?.name || "System User";

      // Get current issue data for history tracking
      const currentIssue = await MachineIssueModel.getIssueById(issueId);
      if (!currentIssue.success || !currentIssue.rows) {
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.status(404).json({ success: false, message: "Issue not found" });
        }
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Issue not found",
          };
        }
        return res.redirect(`/ops/machinery/machines/${id}/issues`);
      }

      // Get machine ID from the issue data
      const machineId = currentIssue.rows.machine_id;

      const result = await MachineIssueModel.updateIssue(issueId, updateData);

      if (result.success) {
        // Track changes in history
        const fieldsToTrack = ["status", "priority", "assigned_to", "title", "description", "resolution_notes"];
        let statusChanged = false;
        let oldStatus = null;
        let newStatus = null;

        for (const field of fieldsToTrack) {
          if (updateData[field] !== undefined && updateData[field] !== currentIssue.rows[field]) {
            await MachineIssueHistoryModel.trackFieldChange(issueId, field, currentIssue.rows[field], updateData[field], changedBy, updateData.change_reason || `Updated ${field}`);

            // Check if status changed for email notification
            if (field === "status") {
              statusChanged = true;
              oldStatus = currentIssue.rows[field];
              newStatus = updateData[field];
            }
          }
        }

        // Send status change alert email if enabled (asynchronous, non-blocking)
        if (statusChanged && emailService.settings.issue_status_change_enabled) {
          // Send email asynchronously without blocking the response
          setImmediate(async () => {
            try {
              // Get machine details for the email
              const machineResult = await MachineModel.getMachineById(machineId);
              const machine = machineResult.success ? machineResult.rows : null;

              const statusDataForEmail = {
                machine_name: machine ? machine.name : "Unknown Machine",
                serial_number: machine ? machine.serial_number : "N/A",
                issue_title: currentIssue.rows.title || "Issue",
                previous_status: oldStatus || "unknown",
                new_status: newStatus || "unknown",
                updated_by: changedBy || "System User",
                updated_at: new Date().toLocaleString(),
                change_reason: updateData.change_reason || "Status updated",
              };

              const emailResult = await emailService.sendStatusChangeAlertEmail(statusDataForEmail);
              if (emailResult.success) {
                console.log(`Status change alert email sent for issue ${issueId}`);
              } else {
                console.error(`Failed to send status change alert email: ${emailResult.error}`);
              }
            } catch (emailError) {
              console.error("Error sending status change alert email:", emailError);
            }
          });
        }

        // Handle response based on content type
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.json({ success: true, message: "Issue updated successfully" });
        }

        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Issue updated successfully",
          };
        }
        res.redirect(`/ops/machinery/issues/${issueId}`);
      } else {
        // Handle response based on content type
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.status(400).json({ success: false, message: result.error || "Failed to update issue" });
        }

        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to update issue",
          };
        }
        res.redirect(`/ops/machinery/machines/${machineId}/issues`);
      }
    } catch (error) {
      console.error("Error updating issue:", error);

      // Handle response based on content type
      if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
        return res.status(500).json({ success: false, message: "Failed to update issue" });
      }

      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to update issue",
        };
      }
      res.redirect(`/ops/machinery/machines/${machineId}/issues`);
    }
  }

  static async deleteIssue(req, res) {
    try {
      const { id, issueId } = req.params;
      const result = await MachineIssueModel.deleteIssue(issueId);

      if (result.success) {
        if (req.session) {
          req.session.toast = {
            type: "success",
            message: "Issue deleted successfully",
          };
        }
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: result.error || "Failed to delete issue",
          };
        }
      }
      res.redirect(`/ops/machinery/machines/${id}/issues`);
    } catch (error) {
      console.error("Error deleting issue:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to delete issue",
        };
      }
      res.redirect(`/ops/machinery/machines/${req.params.id}/issues`);
    }
  }

  static async getIssueEditData(req, res) {
    try {
      const { id, issueId } = req.params;
      const issue = await MachineIssueModel.getIssueById(issueId);

      if (!issue.success || !issue.rows) {
        return res.status(404).json({
          success: false,
          error: "Issue not found",
        });
      }

      // Return issue data as JSON for the edit modal
      res.json({
        success: true,
        issue: issue.rows,
      });
    } catch (error) {
      console.error("Error getting issue edit data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load issue data",
      });
    }
  }

  static async getIssueHistory(req, res) {
    try {
      const { issueId } = req.params;
      const history = await MachineIssueHistoryModel.getIssueHistory(issueId);
      const issue = await MachineIssueModel.getIssueById(issueId);

      if (!issue.success || !issue.rows) {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Issue not found",
          };
        }
        return res.redirect("/machinery/machines");
      }

      // Get toast message and clear it from session before rendering
      const toast = req.session.toast;
      if (req.session.toast) {
        delete req.session.toast;
      }

      const seo = buildSEO({ title: `Issue Details - ${issue.rows.title}`, url: req.path });
      res.render("pages/ops/machinery/issue-details", {
        seo,
        pageKey: "ops/machinery/issue-details",
        title: `Issue Details - ${issue.rows.title}`,
        issue: issue.rows,
        history: history.rows || [],
        toast: toast,
      });
    } catch (error) {
      console.error("Error loading issue history:", error);
      if (req.session) {
        req.session.toast = {
          type: "error",
          message: "Failed to load issue history",
        };
      }
      res.redirect("/machinery/machines");
    }
  }

  static async getAllIssues(req, res) {
    try {
      const { status, priority, machine_id } = req.query;
      let issues;

      if (status) {
        issues = await MachineIssueModel.getIssuesByStatus(status);
      } else {
        issues = await MachineIssueModel.getAllIssues();
      }

      // Filter by priority if specified
      let filteredIssues = issues.rows || [];
      if (priority) {
        filteredIssues = filteredIssues.filter((issue) => issue.priority === priority);
      }
      if (machine_id) {
        filteredIssues = filteredIssues.filter((issue) => issue.machine_id == machine_id);
      }

      const machines = await MachineModel.getAllMachines();

      // Get specific machine details if filtering by machine_id
      let selectedMachine = null;
      let issueStats = {};

      if (machine_id) {
        const machineResult = await MachineModel.getMachineById(machine_id);
        if (machineResult.success) {
          selectedMachine = machineResult.rows;
        }

        // Get ALL issues for this machine (not filtered by status/priority) for statistics
        const allMachineIssues = (issues.rows || []).filter((issue) => issue.machine_id == machine_id);

        // Calculate machine-specific statistics from ALL issues for this machine
        const totalIssues = allMachineIssues.length;
        const openIssues = allMachineIssues.filter((issue) => issue.status === "open").length;
        const inProgressIssues = allMachineIssues.filter((issue) => issue.status === "in_progress").length;
        const criticalIssues = allMachineIssues.filter((issue) => issue.priority === "critical").length;
        const resolvedIssues = allMachineIssues.filter((issue) => issue.status === "resolved").length;

        issueStats = {
          total_issues: totalIssues,
          open_issues: openIssues,
          in_progress_issues: inProgressIssues,
          critical_issues: criticalIssues,
          resolved_issues: resolvedIssues,
        };
      } else {
        // Get global statistics for all issues
        issueStats = await MachineIssueModel.getIssueStats();
        issueStats = issueStats.rows || {};
      }

      const seo = buildSEO({ title: "All Issues", url: req.path });
      res.render("pages/ops/machinery/all-issues", {
        seo,
        pageKey: "ops/machinery/all-issues",
        title: selectedMachine ? `${selectedMachine.name} - Issues` : "All Issues",
        user: req.user,
        issues: filteredIssues,
        machines: machines.rows || [],
        issueStats: issueStats,
        filters: { status, priority, machine_id },
        selectedMachine: selectedMachine,
      });
    } catch (error) {
      console.error("Error loading all issues:", error);
      const seo = buildSEO({ title: "All Issues", url: req.path });
      res.status(500).render("pages/ops/machinery/all-issues", {
        seo,
        pageKey: "ops/machinery/all-issues",
        title: "All Issues",
        user: req.user,
        issues: [],
        machines: [],
        issueStats: {},
        filters: {},
        error: "Failed to load issues",
      });
    }
  }

  static async getIssueDetails(req, res) {
    try {
      const { issueId } = req.params;

      if (!issueId) {
        return res.status(400).render("pages/ops/error", {
          seo: { title: "Bad Request" },
          pageKey: "ops/error",
          title: "Bad Request",
          message: "Issue ID is required",
          error: { status: 400 },
        });
      }

      const issue = await MachineIssueModel.getIssueById(issueId);

      if (issue.success && issue.rows) {
        // Get issue history
        const history = await MachineIssueHistoryModel.getIssueHistory(issueId);

        const seo = buildSEO({ title: `Issue #${issueId} - ${issue.rows.title}`, url: req.path });
        res.render("pages/ops/machinery/issue-details", {
          seo,
          pageKey: "ops/machinery/issue-details",
          title: `Issue #${issueId}`,
          user: req.user,
          issue: issue.rows,
          history: history.success ? history.rows : [],
        });
      } else {
        res.status(404).render("pages/ops/error", {
          seo: { title: "Issue Not Found" },
          pageKey: "ops/error",
          title: "Issue Not Found",
          message: "The requested issue could not be found",
          error: { status: 404 },
        });
      }
    } catch (error) {
      console.error("Error fetching issue details:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Server Error" },
        pageKey: "ops/error",
        title: "Server Error",
        message: "Failed to fetch issue details",
        error: { status: 500 },
      });
    }
  }

  // Upload document for a machine
  static async uploadDocument(req, res) {
    try {
      const { machine_id, title, document_type, description } = req.body;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      if (!machine_id || !title || !document_type) {
        return res.status(400).json({
          success: false,
          message: "Machine ID, title, and document type are required",
        });
      }

      const documentData = {
        machine_id: parseInt(machine_id),
        title: title.trim(),
        document_type,
        file_name: req.file.originalname,
        file_path: `/uploads/documents/${req.file.filename}`,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        description: description ? description.trim() : null,
        uploaded_by: req.session.user ? req.session.user.id : null,
      };

      const result = await MachineDocumentModel.createDocument(documentData);

      if (result.success) {
        req.session.toast = {
          message: "Document uploaded successfully",
          type: "success",
        };
        res.status(201).json({
          success: true,
          message: "Document uploaded successfully",
          documentId: result.id,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to save document information",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading document",
        error: error.message,
      });
    }
  }

  // Get documents for a machine
  static async getMachineDocuments(req, res) {
    try {
      const { id } = req.params;
      const result = await MachineDocumentModel.getDocumentsByMachineId(id);

      if (result.success) {
        res.json({
          success: true,
          documents: result.documents,
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to fetch documents",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching documents",
        error: error.message,
      });
    }
  }

  // Update document details
  static async updateDocument(req, res) {
    try {
      const { id } = req.params;
      const { title, document_type, description } = req.body;

      if (!title || !document_type) {
        return res.status(400).json({
          success: false,
          message: "Title and document type are required",
        });
      }

      const updateData = {
        title: title.trim(),
        document_type,
        description: description ? description.trim() : null,
      };

      const result = await MachineDocumentModel.updateDocument(id, updateData);

      if (result.success && result.affectedRows > 0) {
        req.session.toast = {
          message: "Document updated successfully",
          type: "success",
        };
        res.json({
          success: true,
          message: "Document updated successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Document not found or no changes made",
        });
      }
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({
        success: false,
        message: "Error updating document",
        error: error.message,
      });
    }
  }

  // Delete document
  static async deleteDocument(req, res) {
    try {
      const { id } = req.params;

      // First get document info to delete the file
      const documentResult = await MachineDocumentModel.getDocumentById(id);
      if (!documentResult.success || !documentResult.document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const document = documentResult.document;

      // Delete from database
      const result = await MachineDocumentModel.deleteDocument(id);

      if (result.success && result.affectedRows > 0) {
        // Delete the physical file
        try {
          const fs = await import("fs");
          const path = await import("path");
          const { fileURLToPath } = await import("url");

          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          const filePath = path.join(__dirname, "../../public", document.file_path);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error("Error deleting physical file:", fileError);
          // Don't fail the request if file deletion fails
        }

        req.session.toast = {
          message: "Document deleted successfully",
          type: "success",
        };
        res.json({
          success: true,
          message: "Document deleted successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting document",
        error: error.message,
      });
    }
  }

  // Download document
  static async downloadDocument(req, res) {
    try {
      const { id } = req.params;
      const result = await MachineDocumentModel.getDocumentById(id);

      if (!result.success || !result.document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const document = result.document;
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // Go up from controllers -> machinery -> modules -> src -> project root, then to public
      const filePath = path.join(__dirname, "../../../../public", document.file_path);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: "Document file not found",
        });
      }

      // Set appropriate headers for download
      res.setHeader("Content-Disposition", `attachment; filename="${document.file_name}"`);
      res.setHeader("Content-Type", document.mime_type);
      res.setHeader("Content-Length", document.file_size);

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (error) => {
        console.error("Error streaming file:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error downloading file",
          });
        }
      });
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({
        success: false,
        message: "Error downloading document",
        error: error.message,
      });
    }
  }

  static async previewDocument(req, res) {
    try {
      const { id } = req.params;
      const result = await MachineDocumentModel.getDocumentById(id);

      if (!result.success || !result.document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const document = result.document;
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // Go up from controllers -> machinery -> modules -> src -> project root, then to public
      const filePath = path.join(__dirname, "../../../../public", document.file_path);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: "Document file not found",
        });
      }

      // Set appropriate headers for preview (inline display)
      res.setHeader("Content-Disposition", `inline; filename="${document.file_name}"`);
      res.setHeader("Content-Type", document.mime_type);
      res.setHeader("Content-Length", document.file_size);

      // Add security headers for iframe embedding
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (error) => {
        console.error("Error streaming file for preview:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error previewing file",
          });
        }
      });
    } catch (error) {
      console.error("Error previewing document:", error);
      res.status(500).json({
        success: false,
        message: "Error previewing document",
        error: error.message,
      });
    }
  }

  static async getServiceSchedules(req, res) {
    try {
      const { machine_id } = req.query;
      const serviceSchedules = await ServiceModel.getServiceSchedules({ machine_id });

      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.json({
          success: true,
          data: serviceSchedules.rows || [],
        });
      }

      // Get machine name if machine_id is provided
      let machineName = null;
      if (machine_id) {
        const machine = await MachineModel.getMachineById(machine_id);
        if (machine.success && machine.rows) {
          machineName = machine.rows.name;
        }
      }

      // Set page title based on whether we're filtering by machine
      const pageTitle = machineName ? `Service Schedules - ${machineName}` : "Service Schedules";
      const seo = buildSEO({ title: pageTitle, url: req.path });

      // For web requests, render a service schedules page
      res.render("pages/ops/machinery/service-schedules", {
        seo,
        pageKey: "ops/machinery/service-schedules",
        title: pageTitle,
        user: req.user,
        serviceSchedules: serviceSchedules.rows || [],
        machine_id: machine_id,
        filters: { machine_id },
        machineName: machineName,
      });
    } catch (error) {
      console.error("Error loading service schedules:", error);
      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(500).json({
          success: false,
          message: "Failed to load service schedules",
        });
      }
      res.status(500).render("pages/ops/machinery/service-schedules", {
        seo: buildSEO({ title: "Service Schedules", url: req.path }),
        pageKey: "ops/machinery/service-schedules",
        title: "Service Schedules",
        serviceSchedules: [],
        machineName: null,
        error: "Failed to load service schedules",
      });
    }
  }

  static async createServiceSchedule(req, res) {
    try {
      const scheduleData = req.body;

      // Map frontend frequency to database enum values
      const frequencyMapping = {
        daily: { type: "daily", unit: "days" },
        weekly: { type: "weekly", unit: "weeks" },
        monthly: { type: "monthly", unit: "months" },
        quarterly: { type: "quarterly", unit: "months" },
        "semi-annually": { type: "yearly", unit: "months" },
        annually: { type: "yearly", unit: "years" },
      };

      const frequency = scheduleData.frequency || "monthly";
      const freqConfig = frequencyMapping[frequency] || frequencyMapping["monthly"];

      // Map frontend fields to database fields
      const mappedData = {
        machine_id: scheduleData.machine_id || null,
        service_type_id: 15, // Use default service type (General Maintenance)
        frequency_type: freqConfig.type,
        frequency_value: 1, // Default value
        frequency_unit: freqConfig.unit,
        next_service_date: scheduleData.next_due_date || null,
        last_service_date: null,
        notes: scheduleData.description || null,
      };

      // Ensure no undefined values
      Object.keys(mappedData).forEach((key) => {
        if (mappedData[key] === undefined) {
          mappedData[key] = null;
        }
      });

      console.log("Mapped data for service schedule:", mappedData);

      const result = await ServiceModel.createServiceSchedule(mappedData);

      if (result.success) {
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.json({
            success: true,
            message: "Service schedule created successfully",
            schedule_id: result.id,
          });
        } else {
          if (req.session) {
            req.session.toast = {
              type: "success",
              message: "Service schedule created successfully",
            };
          }
          res.redirect(`/ops/machinery/machines/${scheduleData.machine_id}`);
        }
      } else {
        if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
          return res.status(400).json({
            success: false,
            message: result.error || "Failed to create service schedule",
          });
        } else {
          if (req.session) {
            req.session.toast = {
              type: "error",
              message: result.error || "Failed to create service schedule",
            };
          }
          res.redirect(`/ops/machinery/machines/${scheduleData.machine_id}`);
        }
      }
    } catch (error) {
      console.error("Error creating service schedule:", error);
      if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
        return res.status(500).json({
          success: false,
          message: "Failed to create service schedule",
        });
      } else {
        if (req.session) {
          req.session.toast = {
            type: "error",
            message: "Failed to create service schedule",
          };
        }
        res.redirect(`/ops/machinery/machines/${req.body.machine_id}`);
      }
    }
  }
}
