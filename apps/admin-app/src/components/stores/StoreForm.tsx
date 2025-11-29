import { useState } from 'react';
import { Store, CreateStoreInput, UpdateStoreInput, SubscriptionPlan, SUBSCRIPTION_PLAN_CONFIGS } from '../../types';
import { Button, Input, Select, Modal, ModalFooter } from '../ui';

interface StoreFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStoreInput | UpdateStoreInput) => Promise<void>;
  store?: Store; // If provided, we're editing
  isLoading?: boolean;
}

export default function StoreForm({
  isOpen,
  onClose,
  onSubmit,
  store,
  isLoading = false,
}: StoreFormProps) {
  const isEditing = !!store;

  const [formData, setFormData] = useState({
    name: store?.name || '',
    address: store?.address || '',
    phone: store?.phone || '',
    email: store?.email || '',
    preferred_currency: store?.preferred_currency || 'USD',
    preferred_language: store?.preferred_language || 'en',
    preferred_commission_rate: store?.preferred_commission_rate?.toString() || '0',
    exchange_rate: store?.exchange_rate?.toString() || '89500',
    subscription_plan: 'premium' as SubscriptionPlan,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Store name is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    const commissionRate = parseFloat(formData.preferred_commission_rate);
    if (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      newErrors.preferred_commission_rate = 'Commission rate must be between 0 and 100';
    }

    const exchangeRate = parseFloat(formData.exchange_rate);
    if (isNaN(exchangeRate) || exchangeRate <= 0) {
      newErrors.exchange_rate = 'Exchange rate must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const data: CreateStoreInput | UpdateStoreInput = {
      name: formData.name.trim(),
      address: formData.address.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      preferred_currency: formData.preferred_currency as 'USD' | 'LBP',
      preferred_language: formData.preferred_language as 'en' | 'ar' | 'fr',
      preferred_commission_rate: parseFloat(formData.preferred_commission_rate),
      exchange_rate: parseFloat(formData.exchange_rate),
    };

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
          {/* Basic Information */}
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
              <Input
                label="Address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Store address"
              />
            </div>
          </div>

          {/* Preferences */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">Preferences</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Preferred Currency"
                value={formData.preferred_currency}
                onChange={(e) => handleChange('preferred_currency', e.target.value)}
                options={[
                  { value: 'USD', label: 'US Dollar (USD)' },
                  { value: 'LBP', label: 'Lebanese Pound (LBP)' },
                ]}
              />
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
              <Input
                label="Exchange Rate (LBP/USD)"
                type="number"
                min="1"
                value={formData.exchange_rate}
                onChange={(e) => handleChange('exchange_rate', e.target.value)}
                error={errors.exchange_rate}
                helperText="Current exchange rate"
              />
            </div>
          </div>

          {/* Subscription Plan (only for new stores) */}
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
                        <p>{config.features.branches} branch{config.features.branches > 1 ? 'es' : ''}</p>
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
