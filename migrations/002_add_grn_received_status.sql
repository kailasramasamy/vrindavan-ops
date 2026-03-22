-- Migration 002: Add grn_received status to inward_purchase_orders
-- Created: 2026-03-22
-- Description: New status for when GRN is completed at WMS but supplier hasn't invoiced yet.
--   Replaces the old flow where invoice was auto-generated on GRN completion.
--   New flow: received → grn_received → invoiced → paid
--   Supplier creates invoice manually, not auto-generated from GRN.

ALTER TABLE `inward_purchase_orders`
MODIFY COLUMN `status` enum('received','grn_received','processing','invoiced','paid','disputed','cancelled')
  COLLATE utf8mb4_unicode_ci DEFAULT 'received';
