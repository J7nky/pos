import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
// Removed useSupabaseData - using useOfflineData only
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { 
  Settings as SettingsIcon,
  Bell,
  Package,
  Save,
  AlertTriangle,
  CheckCircle,
  User,
  Shield,
  Database,
  Smartphone,
  Calculator,
  DollarSign,
  Wrench
} from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export default function Settings() {
  const { userProfile } = useSupabaseAuth();
  
  // Use offline context for all settings (offline-first approach)
  console.log('Settings: About to call useOfflineData...');
  const offlineData = useOfflineData();
  console.log('Settings: offlineData received:', offlineData);
  
  // Get all settings from offline context
  const defaultCommissionRate = offlineData?.defaultCommissionRate ?? 10;
  const currency = offlineData?.currency ?? 'USD';
  const lowStockAlertsEnabled = offlineData?.lowStockAlertsEnabled ?? true;
  const lowStockThreshold = offlineData?.lowStockThreshold ?? 10;
  
  // Get update functions from offline context
  const updateDefaultCommissionRate = offlineData?.updateDefaultCommissionRate ?? (() => {});
  const updateCurrency = offlineData?.updateCurrency ?? (() => {});
  const toggleLowStockAlerts = offlineData?.toggleLowStockAlerts ?? (() => {});
  const updateLowStockThreshold = offlineData?.updateLowStockThreshold ?? (() => {});
  
  const { t, language, setLanguage } = useI18n();

  const [tempThreshold, setTempThreshold] = useState(lowStockThreshold?.toString() || '10');
  const [tempCommissionRate, setTempCommissionRate] = useState(defaultCommissionRate?.toString() || '10');
  const [tempCurrency, setTempCurrency] = useState<'USD' | 'LBP'>(currency);
  const [tempExchangeRate, setTempExchangeRate] = useState('89500');
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDatabaseHealth, setShowDatabaseHealth] = useState(false);

  // Handle language change with database update
  const handleLanguageChange = async (newLanguage: string) => {
    setLanguage(newLanguage);
    if (userProfile?.store_id) {
      try {
        // Note: Language preference will be synced to store settings via background sync
        console.log('Language changed to:', newLanguage);
        setShowSaveMessage(true);
        setSaveError(null);
        setTimeout(() => setShowSaveMessage(false), 2000);
      } catch (error) {
        console.error('Failed to save language preference to database:', error);
        setSaveError('Failed to save language preference to database');
        setTimeout(() => setSaveError(null), 3000);
        // Language change still works locally
      }
    }
  };

  const handleThresholdSave = () => {
    const newThreshold = parseInt(tempThreshold);
    if (newThreshold > 0) {
      updateLowStockThreshold(newThreshold);
      setShowSaveMessage(true);
      setTimeout(() => setShowSaveMessage(false), 2000);
    }
  };

  const handleCommissionRateSave = async () => {
    const newRate = parseFloat(tempCommissionRate);
    if (newRate >= 0 && newRate <= 100) {
      try {
        console.log('Settings: Saving commission rate:', newRate);
        console.log('Settings: updateDefaultCommissionRate function:', updateDefaultCommissionRate);
        await updateDefaultCommissionRate(newRate);
        console.log('Settings: Commission rate saved successfully');
        setShowSaveMessage(true);
        setSaveError(null);
        setTimeout(() => setShowSaveMessage(false), 2000);
      } catch (error) {
        console.error('Settings: Error saving commission rate:', error);
        setSaveError('Failed to save commission rate to database');
        setTimeout(() => setSaveError(null), 3000);
      }
    }
  };

  const handleCurrencySave = async () => {
    try {
      console.log('Settings: Saving currency:', tempCurrency);
      console.log('Settings: updateCurrency function:', updateCurrency);
      await updateCurrency(tempCurrency);
      console.log('Settings: Currency saved successfully');
      setShowSaveMessage(true);
      setSaveError(null);
      setTimeout(() => setShowSaveMessage(false), 2000);
    } catch (error) {
      console.error('Settings: Error saving currency:', error);
      setSaveError('Failed to save currency preference to database');
      setTimeout(() => setSaveError(null), 3000);
      // Fallback to local storage - update the temp state to reflect the change
      setTempCurrency(tempCurrency);
    }
  };

  const handleExchangeRateSave = async () => {
    try {
      const exchangeRate = parseFloat(tempExchangeRate);
      if (isNaN(exchangeRate) || exchangeRate <= 0) {
        setSaveError('Please enter a valid exchange rate');
        setTimeout(() => setSaveError(null), 3000);
        return;
      }

      // Update the currency service
      const { currencyService } = await import('../services/currencyService');
      await currencyService.updateExchangeRate(exchangeRate);
      
      console.log('Settings: Exchange rate saved successfully:', exchangeRate);
      setShowSaveMessage(true);
      setSaveError(null);
      setTimeout(() => setShowSaveMessage(false), 2000);
    } catch (error) {
      console.error('Settings: Error saving exchange rate:', error);
      setSaveError('Failed to save exchange rate');
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  const handleToggleAlerts = async (enabled: boolean) => {
    try {
      await toggleLowStockAlerts(enabled);
      setShowSaveMessage(true);
      setSaveError(null);
      setTimeout(() => setShowSaveMessage(false), 2000);
    } catch (error) {
      console.error('Settings: Error toggling low stock alerts:', error);
      setSaveError('Failed to save low stock alert setting to database');
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.header')}</h1>
        {showSaveMessage && (
          <div className="flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
            <CheckCircle className="w-5 h-5 mr-2" />
            {t('settings.saved')}
          </div>
        )}
        {saveError && (
          <div className="flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg">
            <AlertTriangle className="w-5 h-5 mr-2" />
            {saveError}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* User Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <User className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.userInfo')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.name')}</label>
              <input
                type="text"
                value={userProfile?.name || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.email')}</label>
              <input
                type="email"
                value={userProfile?.email || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.role')}</label>
              <input
                type="text"
                value={userProfile?.role || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500 capitalize"
              />
            </div>
          </div>
        </div>

        {/* Inventory Alerts */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Bell className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.inventoryAlerts')}</h2>
          </div>
          
          <div className="space-y-4">
            {/* Low Stock Alerts Toggle */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mr-3" />
                <div>
                  <h3 className="font-medium text-gray-900">{t('settings.lowStockAlerts')}</h3>
                  <p className="text-sm text-gray-600">{t('settings.lowStockDescription')}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggleAlerts(!lowStockAlertsEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  lowStockAlertsEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    lowStockAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Low Stock Threshold */}
            {lowStockAlertsEnabled && (
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center mb-3">
                  <Package className="w-5 h-5 text-blue-500 mr-3" />
                  <h3 className="font-medium text-gray-900">{t('settings.lowStockThreshold')}</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">{t('settings.lowStockDescription')}</p>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={tempThreshold}
                    onChange={(e) => setTempThreshold(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-gray-600">{t('settings.units')}</span>
                  <button
                    onClick={handleThresholdSave}
                    disabled={tempThreshold === (lowStockThreshold?.toString() || '10')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {t('settings.save')}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">{t('settings.currentThreshold', { value: lowStockThreshold })}</p>
              </div>
            )}
          </div>
        </div>

        {/* Commission Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Calculator className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.commissionSettings')}</h2>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-3">
                <DollarSign className="w-5 h-5 text-green-500 mr-3" />
                <h3 className="font-medium text-gray-900">{t('settings.defaultCommissionRate')}</h3>
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={tempCommissionRate}
                  onChange={(e) => setTempCommissionRate(e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-gray-600">%</span>
                <button
                  onClick={handleCommissionRateSave}
                  disabled={tempCommissionRate === (defaultCommissionRate?.toString() || '10')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('settings.save')}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">{t('settings.currentDefaultRate', { value: defaultCommissionRate })}</p>
            </div>
          </div>
        </div>

        {/* Currency Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <DollarSign className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.currencySettings')}</h2>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-3">
                <DollarSign className="w-5 h-5 text-blue-500 mr-3" />
                <h3 className="font-medium text-gray-900">{t('settings.displayCurrency')}</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {t('settings.displayCurrency')}
              </p>
              <div className="flex items-center space-x-3">
                <select
                  value={tempCurrency}
                  onChange={(e) => setTempCurrency(e.target.value as 'USD' | 'LBP')}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="USD">USD ($)</option>
                  <option value="LBP">LBP (ل.ل)</option>
                </select>
                <button
                  onClick={handleCurrencySave}
                  disabled={tempCurrency === currency}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('settings.save')}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">{t('settings.currentCurrency', { value: currency === 'USD' ? 'USD ($)' : 'LBP (ل.ل)' })}</p>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-3">
                <DollarSign className="w-5 h-5 text-green-500 mr-3" />
                <h3 className="font-medium text-gray-900">Exchange Rate (USD to LBP)</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Set the exchange rate for converting between USD and LBP (e.g., 1 USD = 89500 LBP)
              </p>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tempExchangeRate}
                  onChange={(e) => setTempExchangeRate(e.target.value)}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="89500"
                />
                <span className="text-gray-600">LBP per USD</span>
                <button
                  onClick={handleExchangeRateSave}
                  disabled={tempExchangeRate === '89500'}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('settings.save')}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Current rate: 1 USD = {tempExchangeRate} LBP</p>
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Database className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.systemInfo')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">{t('settings.appVersion')}</h3>
              <p className="text-gray-600">ProducePOS v1.0.0</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">{t('settings.dataStorage')}</h3>
              <p className="text-gray-600">Local Storage (Offline-first)</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">{t('settings.lastSync')}</h3>
              <p className="text-gray-600">Never (Local only)</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">{t('settings.deviceType')}</h3>
              <div className="flex items-center text-gray-600">
                <Smartphone className="w-4 h-4 mr-2" />
                {t('settings.webApp')}
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Shield className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.security')}</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">{t('settings.sessionManagement')}</h3>
              <p className="text-sm text-gray-600 mb-3">{t('settings.sessionNote')}</p>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">{t('settings.changePassword')}</button>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <SettingsIcon className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.language')}</h2>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ar">{t('settings.language_ar')}</option>
              <option value="en">{t('settings.language_en')}</option>
              <option value="fr">{t('settings.language_fr')}</option>
            </select>
          </div>
        </div>

   
      </div>

    </div>
  );
}