-- Migration 001: Create inward PO tables for WMS integration
-- Created: 2026-03-20
-- Description: Initial schema for receiving POs from WMS, tracking invoices, and status history

-- Webhook registrations (source systems that can send webhooks)
CREATE TABLE IF NOT EXISTS `webhook_registrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_types` json DEFAULT NULL,
  `api_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `last_received_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_source_key` (`source`, `api_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inward purchase orders (received from WMS)
CREATE TABLE IF NOT EXISTS `inward_purchase_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wms_po_id` int NOT NULL,
  `wms_po_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `warehouse_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('received','processing','invoiced','paid','disputed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'received',
  `po_data` json DEFAULT NULL,
  `po_pdf_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtotal` decimal(12,2) DEFAULT '0.00',
  `gst_amount` decimal(12,2) DEFAULT '0.00',
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `expected_delivery_date` date DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wms_po` (`wms_po_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inward PO line items
CREATE TABLE IF NOT EXISTS `inward_po_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inward_po_id` int NOT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sku` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_of_measure` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordered_qty` int DEFAULT '0',
  `received_qty` int DEFAULT '0',
  `accepted_qty` int DEFAULT '0',
  `quality` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_cost` decimal(10,2) DEFAULT '0.00',
  `gst_pct` decimal(5,2) DEFAULT '0.00',
  `line_total` decimal(12,2) DEFAULT '0.00',
  `wms_product_id` int DEFAULT NULL,
  `wms_variant_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inward_po_id` (`inward_po_id`),
  CONSTRAINT `inward_po_items_ibfk_1` FOREIGN KEY (`inward_po_id`) REFERENCES `inward_purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invoices created by supplier against inward POs
CREATE TABLE IF NOT EXISTS `inward_po_invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inward_po_id` int NOT NULL,
  `invoice_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_date` date DEFAULT NULL,
  `subtotal` decimal(12,2) DEFAULT '0.00',
  `gst_amount` decimal(12,2) DEFAULT '0.00',
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `invoice_pdf_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','sent','acknowledged','paid') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `sent_to_wms_at` timestamp NULL DEFAULT NULL,
  `payment_date` date DEFAULT NULL,
  `payment_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inward_po_id` (`inward_po_id`),
  CONSTRAINT `inward_po_invoices_ibfk_1` FOREIGN KEY (`inward_po_id`) REFERENCES `inward_purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Status transition history
CREATE TABLE IF NOT EXISTS `inward_po_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inward_po_id` int NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inward_po_id` (`inward_po_id`),
  CONSTRAINT `inward_po_status_history_ibfk_1` FOREIGN KEY (`inward_po_id`) REFERENCES `inward_purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
