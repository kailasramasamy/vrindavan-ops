import express from "express";
import { DeliveryPaymentsController } from "./controllers/DeliveryPaymentsController.js";
import { EmployeePaymentsController } from "./controllers/EmployeePaymentsController.js";
import { RentPaymentsController } from "./controllers/RentPaymentsController.js";
import { TransportPaymentsController } from "./controllers/TransportPaymentsController.js";
import { ItServicesPaymentsController } from "./controllers/ItServicesPaymentsController.js";
import { ElectricityPaymentsController } from "./controllers/ElectricityPaymentsController.js";

const router = express.Router();

// Payments Index
router.get("/", DeliveryPaymentsController.renderPaymentsIndexPage);
router.get("/api/summary", DeliveryPaymentsController.getPaymentsSummary);

// Delivery Payments UI
router.get("/delivery", DeliveryPaymentsController.renderDeliveryPaymentsPage);
router.get("/delivery/:recordId", DeliveryPaymentsController.renderDeliveryPaymentRecordPage);

// Employee Payments UI
router.get("/employees", EmployeePaymentsController.renderEmployeePaymentsPage);
router.get("/employees/:recordId", EmployeePaymentsController.renderEmployeePaymentRecordPage);

// Rent Payments UI
router.get("/rent", RentPaymentsController.renderRentPaymentsPage);
router.get("/rent/:recordId", RentPaymentsController.renderRentPaymentRecordPage);

// Transport Payments UI
router.get("/transport", TransportPaymentsController.renderTransportPaymentsPage);
router.get("/transport/:recordId", TransportPaymentsController.renderTransportPaymentRecordPage);

// IT Services Payments UI
router.get("/it-services", ItServicesPaymentsController.renderItServicesPaymentsPage);
router.get("/it-services/:recordId", ItServicesPaymentsController.renderItServicesPaymentRecordPage);

// Electricity Payments UI
router.get("/electricity", ElectricityPaymentsController.renderElectricityPaymentsPage);
router.get("/electricity/:recordId", ElectricityPaymentsController.renderElectricityPaymentRecordPage);

// Delivery Payments APIs
router.get("/api/delivery/cycles", DeliveryPaymentsController.listCycles);
router.get("/api/delivery/cycles/month", DeliveryPaymentsController.getCycleByMonth);
router.get("/api/delivery/cycles/:cycleId", DeliveryPaymentsController.getCycleById);
router.post("/api/delivery/cycles/recalculate", DeliveryPaymentsController.recalculateCycle);
router.post("/api/delivery/cycles/:cycleId/lock", DeliveryPaymentsController.lockCycle);
router.post("/api/delivery/cycles/:cycleId/unlock", DeliveryPaymentsController.unlockCycle);

router.get("/api/delivery/records", DeliveryPaymentsController.listRecords);
router.get("/api/delivery/records/:recordId", DeliveryPaymentsController.getRecordById);
router.patch("/api/delivery/records/:recordId/status", DeliveryPaymentsController.updateRecordStatus);
router.patch("/api/delivery/records/:recordId/remarks", DeliveryPaymentsController.updateRecordRemarks);

router.post("/api/delivery/records/:recordId/entries", DeliveryPaymentsController.createEntry);
router.get("/api/delivery/records/:recordId/entries", DeliveryPaymentsController.listEntries);
router.delete("/api/delivery/entries/:entryId", DeliveryPaymentsController.deleteEntry);
router.post("/api/delivery/records/:recordId/leave", DeliveryPaymentsController.createLeave);

router.get("/api/delivery/records/:recordId/orders", DeliveryPaymentsController.listOrderDetails);

// Employee Payments APIs
router.get("/api/employees/cycles/month", EmployeePaymentsController.getCycleByMonth);
router.post("/api/employees/cycles/recalculate", EmployeePaymentsController.recalculateCycle);

router.get("/api/employees/records", EmployeePaymentsController.listRecords);
router.get("/api/employees/records/:recordId", EmployeePaymentsController.getRecordById);
router.patch("/api/employees/records/:recordId/status", EmployeePaymentsController.updateRecordStatus);
router.patch("/api/employees/records/:recordId/remarks", EmployeePaymentsController.updateRecordRemarks);

router.post("/api/employees/records/:recordId/entries", EmployeePaymentsController.createEntry);
router.patch("/api/employees/entries/:entryId", EmployeePaymentsController.updateEntry);
router.delete("/api/employees/entries/:entryId", EmployeePaymentsController.deleteEntry);

// Rent Payments APIs
router.get("/api/rent/cycles/month", RentPaymentsController.getCycleByMonth);
router.post("/api/rent/cycles/recalculate", RentPaymentsController.recalculateCycle);

router.get("/api/rent/records", RentPaymentsController.listRecords);
router.get("/api/rent/records/:recordId", RentPaymentsController.getRecordById);
router.patch("/api/rent/records/:recordId/status", RentPaymentsController.updateRecordStatus);
router.patch("/api/rent/records/:recordId/remarks", RentPaymentsController.updateRecordRemarks);

router.post("/api/rent/records/:recordId/entries", RentPaymentsController.createEntry);
router.get("/api/rent/records/:recordId/entries", RentPaymentsController.listEntries);
router.patch("/api/rent/entries/:entryId", RentPaymentsController.updateEntry);
router.delete("/api/rent/entries/:entryId", RentPaymentsController.deleteEntry);

// Transport Payments APIs
router.get("/api/transport/cycles/month", TransportPaymentsController.getCycleByMonth);
router.post("/api/transport/cycles/recalculate", TransportPaymentsController.recalculateCycle);

router.get("/api/transport/records", TransportPaymentsController.listRecords);
router.get("/api/transport/records/:recordId", TransportPaymentsController.getRecordById);
router.patch("/api/transport/records/:recordId/status", TransportPaymentsController.updateRecordStatus);
router.patch("/api/transport/records/:recordId/remarks", TransportPaymentsController.updateRecordRemarks);

router.post("/api/transport/records/:recordId/entries", TransportPaymentsController.createEntry);
router.get("/api/transport/records/:recordId/entries", TransportPaymentsController.listEntries);
router.patch("/api/transport/entries/:entryId", TransportPaymentsController.updateEntry);
router.delete("/api/transport/entries/:entryId", TransportPaymentsController.deleteEntry);

// IT Services Payments APIs
router.get("/api/it-services/cycles/month", ItServicesPaymentsController.getCycleByMonth);
router.post("/api/it-services/cycles/recalculate", ItServicesPaymentsController.recalculateCycle);

router.get("/api/it-services/records", ItServicesPaymentsController.listRecords);
router.get("/api/it-services/records/:recordId", ItServicesPaymentsController.getRecordById);
router.post("/api/it-services/records/create", ItServicesPaymentsController.createRecordFromService);
router.patch("/api/it-services/records/:recordId/status", ItServicesPaymentsController.updateRecordStatus);
router.patch("/api/it-services/records/:recordId/remarks", ItServicesPaymentsController.updateRecordRemarks);
router.patch("/api/it-services/records/:recordId/invoice", ItServicesPaymentsController.updateInvoiceDetails);

router.post("/api/it-services/records/:recordId/entries", ItServicesPaymentsController.createEntry);
router.get("/api/it-services/records/:recordId/entries", ItServicesPaymentsController.listEntries);
router.patch("/api/it-services/entries/:entryId", ItServicesPaymentsController.updateEntry);
router.delete("/api/it-services/entries/:entryId", ItServicesPaymentsController.deleteEntry);

// Electricity Payments APIs
router.get("/api/electricity/cycles/month", ElectricityPaymentsController.getCycleByMonth);
router.post("/api/electricity/cycles/recalculate", ElectricityPaymentsController.recalculateCycle);

router.get("/api/electricity/records", ElectricityPaymentsController.listRecords);
router.get("/api/electricity/records/:recordId", ElectricityPaymentsController.getRecordById);
router.post("/api/electricity/records/create", ElectricityPaymentsController.createRecord);
router.patch("/api/electricity/records/:recordId/status", ElectricityPaymentsController.updateRecordStatus);
router.patch("/api/electricity/records/:recordId/remarks", ElectricityPaymentsController.updateRecordRemarks);
router.patch("/api/electricity/records/:recordId/invoice", ElectricityPaymentsController.updateInvoiceDetails);

router.post("/api/electricity/records/:recordId/entries", ElectricityPaymentsController.createEntry);
router.get("/api/electricity/records/:recordId/entries", ElectricityPaymentsController.listEntries);
router.patch("/api/electricity/entries/:entryId", ElectricityPaymentsController.updateEntry);
router.delete("/api/electricity/entries/:entryId", ElectricityPaymentsController.deleteEntry);

export default router;

