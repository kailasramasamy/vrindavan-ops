import PurchaseOrderModel from "../models/PurchaseOrderModel.js";

class PurchaseOrderController {
  // Get all purchase orders
  static async getAllPOs(req, res) {
    try {
      const filters = {
        search: req.query.search,
        vendor_id: req.query.vendor_id,
        status: req.query.status,
        payment_status: req.query.payment_status,
        from_date: req.query.from_date,
        to_date: req.query.to_date,
        missing_invoice: req.query.missing_invoice,
      };

      const result = await PurchaseOrderModel.getAllPOs(filters);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get PO by ID
  static async getPOById(req, res) {
    try {
      const { id } = req.params;
      const result = await PurchaseOrderModel.getPOById(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching purchase order:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create purchase order
  static async createPO(req, res) {
    try {
      const poData = {
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await PurchaseOrderModel.createPO(poData);

      if (result.success) {
        res.json({ success: true, message: "Purchase order created successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update purchase order
  static async updatePO(req, res) {
    try {
      const { id } = req.params;
      const poData = {
        ...req.body,
        updated_by: req.session?.user?.id || 1,
      };

      const result = await PurchaseOrderModel.updatePO(id, poData);

      if (result.success) {
        res.json({ success: true, message: "Purchase order updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating purchase order:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Change PO status
  static async changeStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const changedBy = req.session?.user?.id || 1;

      const result = await PurchaseOrderModel.changeStatus(id, status, changedBy, notes);

      if (result.success) {
        res.json({ success: true, message: "Status updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error changing status:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add invoice
  static async addInvoice(req, res) {
    try {
      const { id } = req.params;

      // Handle file upload
      let invoice_file_url = null;
      if (req.file) {
        invoice_file_url = `/uploads/po/invoices/${req.file.filename}`;
      }

      const invoiceData = {
        po_id: id,
        invoice_number: req.body.invoice_number,
        invoice_date: req.body.invoice_date,
        invoice_amount: req.body.invoice_amount,
        invoice_file_url: invoice_file_url,
        notes: req.body.notes,
        uploaded_by: req.session?.user?.id || 1,
      };

      const result = await PurchaseOrderModel.addInvoice(invoiceData);

      if (result.success) {
        res.json({ success: true, message: "Invoice added successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding invoice:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update shipment
  static async updateShipment(req, res) {
    try {
      const { id } = req.params;
      const shipmentData = {
        po_id: id,
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await PurchaseOrderModel.updateShipment(shipmentData);

      if (result.success) {
        res.json({ success: true, message: "Shipment updated successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating shipment:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add payment
  static async addPayment(req, res) {
    try {
      const { id } = req.params;
      const paymentData = {
        po_id: id,
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await PurchaseOrderModel.addPayment(paymentData);

      if (result.success) {
        res.json({ success: true, message: "Payment added successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding payment:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete purchase order
  static async deletePO(req, res) {
    try {
      const { id } = req.params;
      const result = await PurchaseOrderModel.deletePO(id);

      if (result.success) {
        res.json({ success: true, message: "Purchase order deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(req, res) {
    try {
      const filters = {
        from_date: req.query.from_date,
        to_date: req.query.to_date,
      };

      const result = await PurchaseOrderModel.getDashboardStats(filters);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get invoices report
  static async getInvoicesReport(req, res) {
    try {
      const filters = {
        from_date: req.query.from_date,
        to_date: req.query.to_date,
      };

      const result = await PurchaseOrderModel.getInvoicesReport(filters);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching invoices report:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get PO items
  static async getPOItems(req, res) {
    try {
      const { id } = req.params;
      const result = await PurchaseOrderModel.getPOItems(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching PO items:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Record payment
  static async recordPayment(req, res) {
    try {
      const { id } = req.params;
      const { amount, payment_date, payment_method, reference_number, notes, recorded_by } = req.body;

      // Validate required fields
      if (!amount || !payment_date || !payment_method) {
        return res.status(400).json({ success: false, error: "Amount, payment date, and payment method are required" });
      }

      const result = await PurchaseOrderModel.recordPayment(id, {
        amount: parseFloat(amount),
        payment_date,
        payment_method,
        reference_number: reference_number || null,
        notes: notes || null,
        recorded_by: recorded_by || 1,
      });

      if (result.success) {
        res.json({ success: true, message: "Payment recorded successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error recording payment:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get payment history
  static async getPaymentHistory(req, res) {
    try {
      const { id } = req.params;
      const result = await PurchaseOrderModel.getPaymentHistory(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching payment history:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default PurchaseOrderController;
