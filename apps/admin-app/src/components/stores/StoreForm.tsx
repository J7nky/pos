import { useMemo, useState } from 'react';
import {
  COUNTRY_CONFIGS,
  COUNTRY_MAP,
  CURRENCY_META,
  type CurrencyCode,
} from '@pos-platform/shared';
import { Store, CreateStoreInput, UpdateStoreInput, SubscriptionPlan, SUBSCRIPTION_PLAN_CONFIGS } from '../../types';
import { checkCurrencyUsage } from '../../services/storeService';
import { Button, Input, Select, Modal, ModalFooter } from '../ui';

interface StoreFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStoreInput | UpdateStoreInput) => Promise<void>;
  store?: Store;
  isLoading?: boolean;
}

const CURRENCY_CODES = (Object.keys(CURRENCY_META) as CurrencyCode[]).sort((a, b) => a.localeCompare(b));

const SORTED_COUNTRIES = [...COUNTRY_CONFIGS].sort((a, b) => a.name.localeCompare(b.name));

function formatUsageBlock(
  usage: Record<string, { inventory: number; transactions: number; openBills: number }>
): string {
  return Object.entries(usage)
    .map(([code, u]) => `${code}: ${u.inventory} inventory, ${u.transactions} transactions, ${u.openBills} open bills`)
    .join('; ');
}

export default function StoreForm({
  isOpen,
  onClose,
  onSubmit,
  store,
  isLoading = false,
}: StoreFormProps) {
  const isEditing = !!store;

  const initialAcceptedCurrencies: CurrencyCode[] = store?.accepted_currencies?.length
    ? store.accepted_currencies
    : store
      ? ([store.preferred_currency || 'USD', 'USD'] as CurrencyCode[]).filter((c, i, a) => a.indexOf(c) === i)
      : (['USD'] as CurrencyCode[]);

  // Per-currency rate inputs are kept as strings so partial typing works
  // ("0.", empty) without coercing to NaN. Keys are CurrencyCode.
  const initialRateInputs = (() => {
    const out: Partial<Record<CurrencyCode, string>> = {};
    const map = (store as { exchange_rates?: Partial<Record<CurrencyCode, number>> } | undefined)
      ?.exchange_rates;
    for (const c of initialAcceptedCurrencies) {
      if (c === 'USD') continue;
      if (map && typeof map[c] === 'number') {
        out[c] = String(map[c]);
      } else if (c === store?.preferred_currency && store?.exchange_rate != null) {
        // Legacy: scalar exchange_rate carries the rate for the primary local currency
        out[c] = String(store.exchange_rate);
      } else {
        out[c] = '';
      }
    }
    return out;
  })();

  const [formData, setFormData] = useState({
    name: store?.name || '',
    country: store?.country ?? '',
    address: store?.address || '',
    phone: store?.phone || '',
    email: store?.email || '',
    preferred_currency: (store?.preferred_currency || 'USD') as CurrencyCode,
    accepted_currencies: initialAcceptedCurrencies,
    preferred_language: store?.preferred_language || 'en',
    preferred_commission_rate: store?.preferred_commission_rate?.toString() || '10',
    rate_inputs: initialRateInputs as Partial<Record<CurrencyCode, string>>,
    subscription_plan: 'premium' as SubscriptionPlan,
  });

  const [countryQuery, setCountryQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredCountries = useMemo(
    () =>
      SORTED_COUNTRIES.filter(
        (c) =>
          !countryQuery.trim() ||
          c.name.toLowerCase().includes(countryQuery.toLowerCase()) ||
          c.code.toLowerCase().includes(countryQuery.toLowerCase())
      ),
    [countryQuery]
  );

  const preferredOptions = useMemo(
    () =>
      CURRENCY_CODES.map((code) => ({
        value: code,
        label: `${CURRENCY_META[code].name} (${code})`,
      })),
    []
  );

  const handleCountryChange = (countryCode: string) => {
    const config = COUNTRY_MAP[countryCode];
    if (!config) {
      setFormData((prev) => ({ ...prev, country: countryCode }));
      return;
    }
    setFormData((prev) => {
      const merged: CurrencyCode[] = [...prev.accepted_currencies];
      for (const c of config.defaultCurrencies) {
        if (!merged.includes(c)) merged.push(c);
      }
      const nextRateInputs: Partial<Record<CurrencyCode, string>> = { ...prev.rate_inputs };
      for (const c of merged) {
        if (c === 'USD') continue;
        if (nextRateInputs[c] === undefined) nextRateInputs[c] = '';
      }
      return {
        ...prev,
        country: countryCode,
        preferred_currency: config.localCurrency,
        accepted_currencies: merged,
        rate_inputs: nextRateInputs,
      };
    });
  };

  const handleAcceptedCurrenciesChange = (currency: CurrencyCode, checked: boolean) => {
    setFormData((prev) => {
      if (currency === 'USD') return prev;
      const next = checked
        ? prev.accepted_currencies.includes(currency)
          ? prev.accepted_currencies
          : [...prev.accepted_currencies, currency]
        : prev.accepted_currencies.filter((c) => c !== currency);
      const nextRateInputs: Partial<Record<CurrencyCode, string>> = { ...prev.rate_inputs };
      if (checked && currency !== 'USD' && nextRateInputs[currency] === undefined) {
        nextRateInputs[currency] = '';
      }
      if (!checked) {
        delete nextRateInputs[currency];
      }
      return { ...prev, accepted_currencies: next, rate_inputs: nextRateInputs };
    });
  };

  const handleRateChange = (currency: CurrencyCode, value: string) => {
    setFormData((prev) => ({
      ...prev,
      rate_inputs: { ...prev.rate_inputs, [currency]: value },
    }));
    if (errors[`rate_${currency}`]) {
      setErrors((prev) => ({ ...prev, [`rate_${currency}`]: '' }));
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Store name is required';
    }

    if (!formData.country.trim()) {
      newErrors.country = 'Country is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    const commissionRate = parseFloat(formData.preferred_commission_rate);
    if (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      newErrors.preferred_commission_rate = 'Commission rate must be between 0 and 100';
    }

    if (!formData.accepted_currencies.length) {
      newErrors.accepted_currencies = 'Select at least one accepted currency';
    }

    if (!formData.accepted_currencies.includes('USD')) {
      newErrors.accepted_currencies = 'USD must be among accepted currencies';
    }

    if (!formData.accepted_currencies.includes(formData.preferred_currency)) {
      newErrors.preferred_currency = 'Preferred currency must be in accepted currencies';
    }

    // Validate one positive rate per non-USD accepted currency.
    for (const c of formData.accepted_currencies) {
      if (c === 'USD') continue;
      const raw = formData.rate_inputs[c];
      const rate = parseFloat(raw ?? '');
      if (isNaN(rate) || rate <= 0) {
        newErrors[`rate_${c}`] = `Enter a positive rate for ${c}`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (isEditing && store?.accepted_currencies?.length) {
      const removed = store.accepted_currencies.filter((c) => !formData.accepted_currencies.includes(c));
      if (removed.length > 0) {
        const usage = await checkCurrencyUsage(store.id, removed);
        const blockers = Object.entries(usage).filter(([, u]) => u.inventory + u.transactions + u.openBills > 0);
        if (blockers.length > 0) {
          const usageMap = Object.fromEntries(blockers) as Record<
            string,
            { inventory: number; transactions: number; openBills: number }
          >;
          setErrors({
            accepted_currencies: `Cannot remove: ${formatUsageBlock(usageMap)}`,
          });
          return;
        }
      }
    }

    // Build per-currency exchange_rates map from the inputs. USD is implicit
    // and never written into the map.
    const exchangeRatesMap: Partial<Record<CurrencyCode, number>> = {};
    for (const c of formData.accepted_currencies) {
      if (c === 'USD') continue;
      const r = parseFloat(formData.rate_inputs[c] ?? '');
      if (!isNaN(r) && r > 0) exchangeRatesMap[c] = r;
    }
    // Keep the legacy scalar exchange_rate in sync with the primary local
    // currency's rate so older read paths keep working until 11d/Phase 17 cleanup.
    const scalarRate =
      formData.preferred_currency === 'USD'
        ? undefined
        : exchangeRatesMap[formData.preferred_currency];

    const base = {
      name: formData.name.trim(),
      country: formData.country,
      address: formData.address.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      preferred_currency: formData.preferred_currency,
      accepted_currencies: formData.accepted_currencies,
      preferred_language: formData.preferred_language as 'en' | 'ar' | 'fr',
      preferred_commission_rate: parseFloat(formData.preferred_commission_rate),
      exchange_rate: scalarRate,
      exchange_rates: exchangeRatesMap,
    };

    const data: CreateStoreInput | UpdateStoreInput = isEditing
      ? (base as UpdateStoreInput)
      : ({ ...base, subscription_plan: formData.subscription_plan } as CreateStoreInput);

    await onSubmit(data);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Store' : 'Create New Store'}
      description={
        isEditing
          ? 'Update the store information below.'
          : 'Fill in the details to create a new store. A default branch will be created automatically.'
      }
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Basic Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Store Name *"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                error={errors.name}
                placeholder="Enter store name"
              />
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                <Input
                  value={countryQuery}
                  onChange={(e) => setCountryQuery(e.target.value)}
                  placeholder="Search country…"
                  className="mb-2"
                />
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={formData.country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                >
                  <option value="">Select country</option>
                  {filteredCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                {errors.country && <p className="text-sm text-red-600 mt-1">{errors.country}</p>}
              </div>
              <Input
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                error={errors.email}
                placeholder="store@example.com"
              />
              <Input
                label="Phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+961 XX XXX XXX"
              />
              <div className="md:col-span-2">
                <Input
                  label="Address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Store address"
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Preferences</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Preferred Currency"
                value={formData.preferred_currency}
                onChange={(e) => handleChange('preferred_currency', e.target.value)}
                options={preferredOptions}
              />
              <div className="md:col-span-2">
                <span className="block text-sm font-medium text-gray-700 mb-2">Accepted currencies</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {CURRENCY_CODES.map((code) => (
                    <label key={code} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.accepted_currencies.includes(code)}
                        disabled={code === 'USD'}
                        onChange={(e) => handleAcceptedCurrenciesChange(code, e.target.checked)}
                      />
                      <span>
                        {code} — {CURRENCY_META[code].name}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.accepted_currencies && (
                  <p className="text-sm text-red-600 mt-1">{errors.accepted_currencies}</p>
                )}
              </div>
              <Select
                label="Preferred Language"
                value={formData.preferred_language}
                onChange={(e) => handleChange('preferred_language', e.target.value)}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'ar', label: 'العربية (Arabic)' },
                  { value: 'fr', label: 'Français (French)' },
                ]}
              />
              <Input
                label="Commission Rate (%)"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.preferred_commission_rate}
                onChange={(e) => handleChange('preferred_commission_rate', e.target.value)}
                error={errors.preferred_commission_rate}
                helperText="Default commission rate for suppliers"
              />
            </div>

            {formData.accepted_currencies.some((c) => c !== 'USD') && (
              <div className="mt-4">
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Exchange rates (per 1 USD)
                </span>
                <div className="space-y-2">
                  {formData.accepted_currencies
                    .filter((c) => c !== 'USD')
                    .map((c) => (
                      <Input
                        key={c}
                        label={`${c} per 1 USD`}
                        type="number"
                        min="0"
                        step="any"
                        value={formData.rate_inputs[c] ?? ''}
                        onChange={(e) => handleRateChange(c, e.target.value)}
                        error={errors[`rate_${c}`]}
                        helperText={
                          c === formData.preferred_currency
                            ? `Rate of 1 USD in ${c} (primary local currency)`
                            : `Rate of 1 USD in ${c}`
                        }
                      />
                    ))}
                </div>
              </div>
            )}
          </div>

          {!isEditing && (
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-4">Subscription Plan</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {SUBSCRIPTION_PLAN_CONFIGS.map((config) => (
                  <div
                    key={config.plan}
                    onClick={() => handleChange('subscription_plan', config.plan)}
                    className={`
                      relative p-4 border-2 rounded-lg cursor-pointer transition-all
                      ${
                        formData.subscription_plan === config.plan
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    {config.plan === 'premium' && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                        Popular
                      </span>
                    )}
                    <div className="text-center">
                      <h5 className="font-semibold text-gray-900">{config.name}</h5>
                      <p className="text-xs text-gray-500 mt-1">{config.subtitle}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-2">
                        ${config.monthlyPrice}
                        <span className="text-sm font-normal text-gray-500">/mo</span>
                      </p>
                      <div className="mt-3 text-xs text-gray-600 space-y-1">
                        <p>
                          {config.features.branches} branch{config.features.branches > 1 ? 'es' : ''}
                        </p>
                        <p>
                          {config.features.users === 'unlimited'
                            ? 'Unlimited users'
                            : `${config.features.users} users`}
                        </p>
                        <p>
                          {config.features.products === 'unlimited'
                            ? 'Unlimited products'
                            : `${config.features.products} products`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditing ? 'Save Changes' : 'Create Store'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
