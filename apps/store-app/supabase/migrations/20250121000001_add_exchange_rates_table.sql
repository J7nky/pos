-- Create exchange_rates table for currency conversion sync
CREATE TABLE IF NOT EXISTS exchange_rates (
  id text PRIMARY KEY,
  from_currency text NOT NULL CHECK (from_currency IN ('USD', 'LBP')),
  to_currency text NOT NULL CHECK (to_currency IN ('USD', 'LBP')),
  rate numeric(15,6) NOT NULL CHECK (rate > 0),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_updated_at ON exchange_rates(updated_at);

-- Insert default exchange rates
INSERT INTO exchange_rates (id, from_currency, to_currency, rate, created_at, updated_at)
VALUES 
  ('rate_usd_lbp_default', 'USD', 'LBP', 89500, NOW(), NOW()),
  ('rate_lbp_usd_default', 'LBP', 'USD', 0.0000112, NOW(), NOW()),
  ('rate_usd_usd_default', 'USD', 'USD', 1, NOW(), NOW()),
  ('rate_lbp_lbp_default', 'LBP', 'LBP', 1, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exchange_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_exchange_rates_updated_at
  BEFORE UPDATE ON exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_exchange_rates_updated_at();

