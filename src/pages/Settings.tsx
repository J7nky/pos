import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
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
  Printer,
  Building,
  Phone,
  MapPin,
} from 'lucide-react';

export default function Settings() {
  const { userProfile } = useSupabaseAuth();
  
  // Use offline context for all settings (offline-first approach)
  const offlineData = useOfflineData();  
  // Get all settings from offline context
  const defaultCommissionRate = offlineData?.defaultCommissionRate ?? 10;
  const currency = offlineData?.currency ?? 'USD';
  const lowStockAlertsEnabled = offlineData?.lowStockAlertsEnabled ?? true;
  const lowStockThreshold = offlineData?.lowStockThreshold ?? 10;
  const exchangeRate = offlineData?.exchangeRate ?? 89500;
  
  // Get update functions from offline context
  const updateDefaultCommissionRate = offlineData?.updateDefaultCommissionRate ?? (() => {});
  const updateCurrency = offlineData?.updateCurrency ?? (() => {});
  const toggleLowStockAlerts = offlineData?.toggleLowStockAlerts ?? (() => {});
  const updateLowStockThreshold = offlineData?.updateLowStockThreshold ?? (() => {});
  const updateExchangeRate = offlineData?.updateExchangeRate ?? (() => {});
  
  const { t, language, setLanguage } = useI18n();

  const [tempThreshold, setTempThreshold] = useState(lowStockThreshold?.toString() || '10');
  const [tempCommissionRate, setTempCommissionRate] = useState(defaultCommissionRate?.toString() || '10');
  const [tempCurrency, setTempCurrency] = useState<'USD' | 'LBP'>(currency);
  const [tempExchangeRate, setTempExchangeRate] = useState(exchangeRate?.toString() || '89500');
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Language change is now handled by the I18nProvider through OfflineDataContext
  // No need for custom handling here

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
        await updateDefaultCommissionRate(newRate);
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
      await updateCurrency(tempCurrency);
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
      const newExchangeRate = parseFloat(tempExchangeRate);
      if (isNaN(newExchangeRate) || newExchangeRate <= 0) {
        setSaveError('Please enter a valid exchange rate');
        setTimeout(() => setSaveError(null), 3000);
        return;
      }

      // Update exchange rate through offline context
      await updateExchangeRate(newExchangeRate);
      
      setShowSaveMessage(true);
      setSaveError(null);
      setTimeout(() => setShowSaveMessage(false), 2000);
    } catch (error) {
      console.error('Settings: Error saving exchange rate:', error);
      setSaveError('Failed to save exchange rate to database');
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
                  disabled={tempExchangeRate === (exchangeRate?.toString() || '89500')}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t('settings.save')}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Current rate: 1 USD = {exchangeRate} LBP</p>
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


        {/* Receipt Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <SettingsIcon className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Receipt Settings</h2>
          </div>
          <ReceiptSettings />
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
              onChange={(e) => setLanguage(e.target.value)}
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

// Receipt Settings Component
function ReceiptSettings() {
  const offlineData = useOfflineData();
  
  // Get receipt settings from offline context (with defaults)
  const receiptSettings = offlineData?.receiptSettings || {
    storeName: 'KIWI VEGETABLES MARKET',
    address: '63-B2-Whole Sale Market, Tripoli - Lebanon',
    phone1: '+961 70 123 456',
    phone1Name: 'Samir',
    phone2: '03 123 456',
    phone2Name: 'Mohammad',
    thankYouMessage: 'Thank You!',
    billNumberPrefix: '000',
    showPreviousBalance: true,
    showItemCount: true,
    receiptWidth: 32
  };

  const [tempSettings, setTempSettings] = useState(receiptSettings);
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      // Update receipt settings in offline context
      if (offlineData?.updateReceiptSettings) {
        await offlineData.updateReceiptSettings(tempSettings);
        setShowSaveMessage(true);
        setSaveError(null);
        setTimeout(() => setShowSaveMessage(false), 2000);
      }
    } catch (error) {
      console.error('Error saving receipt settings:', error);
      setSaveError('Failed to save receipt settings');
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setTempSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCheckboxChange = (field: string, checked: boolean) => {
    setTempSettings(prev => ({
      ...prev,
      [field]: checked
    }));
  };

  return (
    <div className="space-y-6">
      {/* Save Message */}
      {showSaveMessage && (
        <div className="flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
          <CheckCircle className="w-5 h-5 mr-2" />
          Receipt settings saved successfully!
        </div>
      )}
      {saveError && (
        <div className="flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {saveError}
        </div>
      )}

      {/* Store Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Building className="w-5 h-5 mr-2" />
          Store Information
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store Name
            </label>
            <input
              type="text"
              value={tempSettings.storeName}
              onChange={(e) => handleInputChange('storeName', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="KIWI VEGETABLES MARKET"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <input
              type="text"
              value={tempSettings.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="63-B2-Whole Sale Market, Tripoli - Lebanon"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone 1 Name
            </label>
            <input
              type="text"
              value={tempSettings.phone1Name}
              onChange={(e) => handleInputChange('phone1Name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Samir"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone 1 Number
            </label>
            <input
              type="text"
              value={tempSettings.phone1}
              onChange={(e) => handleInputChange('phone1', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="+961 70 123 456"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone 2 Name
            </label>
            <input
              type="text"
              value={tempSettings.phone2Name}
              onChange={(e) => handleInputChange('phone2Name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Mohammad"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone 2 Number
            </label>
            <input
              type="text"
              value={tempSettings.phone2}
              onChange={(e) => handleInputChange('phone2', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="03 123 456"
            />
          </div>
        </div>
      </div>

      {/* Receipt Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Printer className="w-5 h-5 mr-2" />
          Receipt Options
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Thank You Message
            </label>
            <input
              type="text"
              value={tempSettings.thankYouMessage}
              onChange={(e) => handleInputChange('thankYouMessage', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Thank You!"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bill Number Prefix
            </label>
            <input
              type="text"
              value={tempSettings.billNumberPrefix}
              onChange={(e) => handleInputChange('billNumberPrefix', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="000"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Receipt Width (characters)
            </label>
            <input
              type="number"
              value={tempSettings.receiptWidth}
              onChange={(e) => handleInputChange('receiptWidth', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="32"
              min="20"
              max="48"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showPreviousBalance"
              checked={tempSettings.showPreviousBalance}
              onChange={(e) => handleCheckboxChange('showPreviousBalance', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="showPreviousBalance" className="ml-2 block text-sm text-gray-900">
              Show Previous Balance
            </label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showItemCount"
              checked={tempSettings.showItemCount}
              onChange={(e) => handleCheckboxChange('showItemCount', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="showItemCount" className="ml-2 block text-sm text-gray-900">
              Show Total Items Count
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Receipt Settings
        </button>
      </div>
    </div>
  );
}