-- Add columns to track sync state of cpp_billing rows against runq's
-- bill-sync API. One bill in cpp_billing maps to at most one purchase
-- invoice in runq, identified by runq_bill_id. runq_sync_version mirrors
-- the externalVersion field on the runq side and bumps each time we
-- successfully resync a changed bill amount.

ALTER TABLE cpp_billing
  ADD COLUMN runq_bill_id      VARCHAR(64)  DEFAULT NULL,
  ADD COLUMN runq_sync_version INT          NOT NULL DEFAULT 0,
  ADD COLUMN runq_sync_status  VARCHAR(32)  DEFAULT NULL,
  ADD COLUMN runq_sync_error   TEXT         DEFAULT NULL,
  ADD COLUMN runq_synced_at    DATETIME     DEFAULT NULL;

CREATE INDEX idx_cpp_billing_runq_status ON cpp_billing(runq_sync_status);
