-- 🚀 Database Performance Indexes
-- Based on performance test results and recommendations
-- This script adds indexes to improve query performance

-- 1. Composite index for bills table (store_id, created_at)
-- Improves queries that filter by store and sort by creation date
CREATE INDEX IF NOT EXISTS idx_bills_store_created 
ON bills(store_id, created_at DESC);

-- 2. Payment status index
-- Improves filtering by payment status
CREATE INDEX IF NOT EXISTS idx_bills_payment_status 
ON bills(payment_status);

-- 3. Bill number search index
-- Improves search operations by bill number
CREATE INDEX IF NOT EXISTS idx_bills_bill_number 
ON bills(bill_number);

-- 4. Customer lookup index
-- Improves customer-related queries
CREATE INDEX IF NOT EXISTS idx_bills_customer_id 
ON bills(customer_id);

-- 5. Status index for active bills
-- Improves filtering by bill status
CREATE INDEX IF NOT EXISTS idx_bills_status 
ON bills(status);

-- 6. Total amount index for financial queries
-- Improves queries that filter by amount ranges
CREATE INDEX IF NOT EXISTS idx_bills_total_amount 
ON bills(total_amount);

-- 7. Bill date index for date-based queries
-- Improves date range queries
CREATE INDEX IF NOT EXISTS idx_bills_bill_date 
ON bills(bill_date);

-- 8. Composite index for complex filtering
-- Improves queries with multiple WHERE conditions
CREATE INDEX IF NOT EXISTS idx_bills_complex_filter 
ON bills(store_id, status, payment_status, created_at DESC);

-- 9. Index for audit logs performance
-- Improves audit trail queries
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_timeline 
ON bill_audit_logs(bill_id, created_at DESC);

-- 10. Index for bill line items
-- Improves line item queries
CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill 
ON bill_line_items(bill_id, line_order);

-- Show index creation results
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('bills', 'bill_line_items', 'bill_audit_logs')
ORDER BY tablename, indexname;

