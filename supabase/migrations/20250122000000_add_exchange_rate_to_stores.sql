-- Add exchange_rate column to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS exchange_rate numeric(15,6) DEFAULT 89500;

-- Update existing stores with default exchange rate if not set
UPDATE stores SET exchange_rate = 89500 WHERE exchange_rate IS NULL;

-- Add comment to explain the column
COMMENT ON COLUMN stores.exchange_rate IS 'USD to LBP exchange rate (e.g., 89500 means 1 USD = 89500 LBP)';

