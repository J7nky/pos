-- Remove exchange_rates table as we now use exchange_rate field in stores table
-- Drop the exchange_rates table and related objects

-- Drop the trigger first
DROP TRIGGER IF EXISTS trigger_update_exchange_rates_updated_at ON exchange_rates;

-- Drop the function
DROP FUNCTION IF EXISTS update_exchange_rates_updated_at();

-- Drop the table
DROP TABLE IF EXISTS exchange_rates;

-- Drop the indexes (they will be dropped with the table, but being explicit)
DROP INDEX IF EXISTS idx_exchange_rates_from_currency;
DROP INDEX IF EXISTS idx_exchange_rates_to_currency;
DROP INDEX IF EXISTS idx_exchange_rates_currencies;
DROP INDEX IF EXISTS idx_exchange_rates_updated_at;
DROP INDEX IF EXISTS idx_exchange_rates_synced;
DROP INDEX IF EXISTS idx_exchange_rates_deleted;




