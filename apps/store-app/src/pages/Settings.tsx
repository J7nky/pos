import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { useErrorHandler } from '../hooks/useErrorHandler';
import BranchSelectionScreen from '../components/BranchSelectionScreen';
import packageJson from '../../package.json';
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
  RefreshCw,
  Briefcase,
  Trash2,
} from 'lucide-react';

type SettingsTab = 'account' | 'business' | 'inventory' | 'receipt' | 'preferences';

export default function Settings() {
  const { userProfile } = useSupabaseAuth();
  const [appVersion, setAppVersion] = useState<string>(packageJson.version);
  
  // Get app version from Electron if available, otherwise use package.json
  useEffect(() => {
    const getVersion = async () => {
      // Check if running in Electron
      if (typeof window !== 'undefined' && window.electronAPI?.getAppVersion) {
        try {
          const result = await window.electronAPI.getAppVersion();
          if (result.success && result.version) {
            setAppVersion(result.version);
          }
        } catch (error) {
          handleError(error);
          // Keep package.json version as fallback
        }
      }
    };
    getVersion();
  }, []);
  
  // Check if user is admin or manager
  const isAdminOrManager = userProfile?.role === 'admin' || userProfile?.role === 'manager';
  // Check if user is admin (only admin can edit branch info)
  const isAdmin = userProfile?.role === 'admin';
  
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
  const { handleError } = useErrorHandler();

  const [tempThreshold, setTempThreshold] = useState(lowStockThreshold?.toString() || '10');
  const [tempCommissionRate, setTempCommissionRate] = useState(defaultCommissionRate?.toString() || '10');
  const [tempCurrency, setTempCurrency] = useState<'USD' | 'LBP'>(currency);
  const [tempExchangeRate, setTempExchangeRate] = useState(exchangeRate?.toString() || '89500');
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showBranchSelection, setShowBranchSelection] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Sync local state with context values when they change (important for real-time updates from other devices)
  useEffect(() => {
    const newValue = defaultCommissionRate?.toString() || '10';
    console.log(`[Settings] Syncing tempCommissionRate from context: ${defaultCommissionRate} -> ${newValue}`);
    setTempCommissionRate(newValue);
  }, [defaultCommissionRate]);

  useEffect(() => {
    console.log(`[Settings] Syncing tempCurrency from context: ${currency}`);
    setTempCurrency(currency);
  }, [currency]);

  useEffect(() => {
    const newValue = exchangeRate?.toString() || '89500';
    console.log(`[Settings] Syncing tempExchangeRate from context: ${exchangeRate} -> ${newValue}`);
    setTempExchangeRate(newValue);
  }, [exchangeRate]);

  useEffect(() => {
    const newValue = lowStockThreshold?.toString() || '10';
    console.log(`[Settings] Syncing tempThreshold from context: ${lowStockThreshold} -> ${newValue}`);
    setTempThreshold(newValue);
  }, [lowStockThreshold]);

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
        handleError(error);
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
      handleError(error);
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
      handleError(error);
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
      handleError(error);
      setSaveError('Failed to save low stock alert setting to database');
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  const handleBranchSelected = (branchId: string) => {
    console.log('🏢 Admin selected branch from settings:', branchId);
    if (offlineData?.setCurrentBranchId && userProfile?.store_id) {
      offlineData.setCurrentBranchId(branchId);
      // Save preference to localStorage (matching BranchSelectionScreen behavior)
      localStorage.setItem(`branch_preference_${userProfile.store_id}`, branchId);
    }
    setShowBranchSelection(false);
  };

  // Show branch selection screen if admin clicked switch branch
  if (showBranchSelection && isAdmin) {
    return (
      <BranchSelectionScreen 
        onBranchSelected={handleBranchSelected}
      />
    );
  }

  // Define tabs with visibility
  const tabs: { id: SettingsTab; label: string; icon: React.ElementType; visible: boolean }[] = [
    { id: 'account', label: 'Account & Profile', icon: User, visible: true },
    { id: 'business', label: 'Business Settings', icon: Briefcase, visible: true },
    { id: 'inventory', label: 'Inventory', icon: Package, visible: true },
    { id: 'receipt', label: 'Receipt & Printing', icon: Printer, visible: isAdminOrManager },
    { id: 'preferences', label: 'Preferences', icon: SettingsIcon, visible: true },
  ];

  const visibleTabs = tabs.filter(tab => tab.visible);

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

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md transition-colors flex items-center relative whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {/* Account & Profile Tab */}
        {activeTab === 'account' && (
          <>
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

            {/* Branch Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Building className="w-6 h-6 text-gray-600 mr-3" />
                  <h2 className="text-xl font-semibold text-gray-900">{t('settings.branchInfo')}</h2>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setShowBranchSelection(true)}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Switch Branch
                  </button>
                )}
              </div>
              <BranchInfoSection />
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
          </>
        )}

        {/* Business Settings Tab */}
        {activeTab === 'business' && (
          <>
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
          </>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
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
        )}

        {/* Receipt & Printing Tab */}
        {activeTab === 'receipt' && isAdminOrManager && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center mb-4">
              <Printer className="w-6 h-6 text-gray-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Receipt Settings</h2>
            </div>
            <ReceiptSettings />
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <>
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

            {/* System Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center mb-4">
                <Database className="w-6 h-6 text-gray-600 mr-3" />
                <h2 className="text-xl font-semibold text-gray-900">{t('settings.systemInfo')}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">{t('settings.appVersion')}</h3>
                  <p className="text-gray-600">ProducePOS v{appVersion}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">{t('settings.dataStorage')}</h3>
                  <p className="text-gray-600">Local Storage (Offline-first)</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">{t('settings.lastSync')}</h3>
                  <p className="text-gray-600">
                    {(() => {
                      const syncStatus = offlineData?.getSyncStatus?.();
                      const lastSync = syncStatus?.lastSync;
                      return lastSync 
                        ? new Date(lastSync).toLocaleString()
                        : 'Never (Local only)';
                    })()}
                  </p>
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
          </>
        )}
      </div>

    </div>
  );
}

// Receipt Settings Component
function ReceiptSettings() {
  const { userProfile } = useSupabaseAuth();
  const offlineData = useOfflineData();
  
  // Check if user is admin or manager (defensive check)
  const isAdminOrManager = userProfile?.role === 'admin' || userProfile?.role === 'manager';
  
  // Get receipt settings from offline context (populated from store data)
  const receiptSettings = offlineData?.receiptSettings || {
    storeName: '',
    address: '',
    phone1: '',
    phone1Name: '',
    phone2: '',
    phone2Name: '',
    thankYouMessage: 'Thank You!',
    billNumberPrefix: '000',
    showPreviousBalance: true,
    showItemCount: true,
    receiptWidth: 32,
    defaultPrinterType: 'auto' as 'auto' | 'thermal' | 'normal',
    defaultPrinterName: '',
    autoPrint: false,
  };

  const [tempSettings, setTempSettings] = useState(receiptSettings);
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availablePrinters, setAvailablePrinters] = useState<Array<{ name: string; isDefault: boolean }>>([]);
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Load available printers on mount (Electron only)
  useEffect(() => {
    if (!isElectron) return;
    (window as any).electronAPI.getPrinters().then((result: any) => {
      const list: Array<{ name: string; isDefault: boolean }> = [];
      if (Array.isArray(result)) {
        result.forEach((p: any) => list.push({ name: p.name, isDefault: !!p.isDefault }));
      } else if (result?.printers) {
        result.printers.forEach((p: any) => list.push({ name: p.name, isDefault: !!p.isDefault }));
      }
      setAvailablePrinters(list);
    }).catch(() => {/* silently ignore if not available */});
  }, [isElectron]);

  const handleSave = async () => {
    console.log('🔄 handleSave called for receipt settings', { hasUpdateReceiptSettings: !!offlineData?.updateReceiptSettings, settings: tempSettings });
    
    if (!offlineData?.updateReceiptSettings) {
      const errorMsg = 'Update function not available. Please refresh the page.';
      setSaveError(errorMsg);
      setTimeout(() => setSaveError(null), 3000);
      return;
    }
    
    try {
      console.log('💾 Saving receipt settings:', tempSettings);
      await offlineData.updateReceiptSettings(tempSettings);
      console.log('✅ Receipt settings saved successfully');
      setShowSaveMessage(true);
      setSaveError(null);
      setTimeout(() => setShowSaveMessage(false), 2000);
    } catch (error) {
      handleError(error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to save receipt settings';
      setSaveError(errorMsg);
      setTimeout(() => setSaveError(null), 3000);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setTempSettings((prev: typeof receiptSettings) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCheckboxChange = (field: string, checked: boolean) => {
    setTempSettings((prev: typeof receiptSettings) => ({
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
              placeholder="03 123 456"
            />
          </div>
        </div>
      </div>

      {/* Branch Logo */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Building className="w-5 h-5 mr-2" />
          Branch Logo
        </h3>
        
        <BranchLogoUpload />
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={!isAdminOrManager}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label htmlFor="showItemCount" className="ml-2 block text-sm text-gray-900">
              Show Total Items Count
            </label>
          </div>
        </div>
      </div>

      {/* Printer Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Printer className="w-5 h-5 mr-2" />
          Printer Settings
        </h3>

        {/* Printer Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Printer Type
          </label>
          <div className="flex gap-3">
            {(['auto', 'thermal', 'normal'] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="defaultPrinterType"
                  value={type}
                  checked={tempSettings.defaultPrinterType === type}
                  onChange={() => setTempSettings((prev: typeof receiptSettings) => ({ ...prev, defaultPrinterType: type }))}
                  disabled={!isAdminOrManager}
                  className="text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-700 capitalize">
                  {type === 'auto' ? 'Auto-detect' : type === 'thermal' ? 'Thermal (ESC/POS)' : 'Normal (A4)'}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Auto-detect will use A4 if a non-thermal printer is found, or thermal if a thermal printer is found.
          </p>
        </div>

        {/* Default Printer Name (Electron only) */}
        {isElectron && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Printer
            </label>
            <select
              value={tempSettings.defaultPrinterName}
              onChange={(e) => setTempSettings((prev: typeof receiptSettings) => ({ ...prev, defaultPrinterName: e.target.value }))}
              disabled={!isAdminOrManager}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              <option value="">System default</option>
              {availablePrinters.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}{p.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {availablePrinters.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No printers detected. Connect a printer and refresh.</p>
            )}
          </div>
        )}

        {/* Auto-print toggle */}
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Auto-print without asking</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              When enabled, the bill prints immediately after sale — no confirmation dialog.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isAdminOrManager) {
                setTempSettings((prev: typeof receiptSettings) => ({ ...prev, autoPrint: !prev.autoPrint }));
              }
            }}
            disabled={!isAdminOrManager}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              tempSettings.autoPrint ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                tempSettings.autoPrint ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Save Button */}
      {isAdminOrManager && (
        <div className="flex justify-end">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('🔘 Save Receipt Settings button clicked');
              handleSave();
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Receipt Settings
          </button>
        </div>
      )}
    </div>
  );
}

// Branch Logo Upload Component
function BranchLogoUpload() {
  const { userProfile } = useSupabaseAuth();
  const offlineData = useOfflineData();
  const [logo, setLogo] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [globalLogos, setGlobalLogos] = useState<Array<{ name: string; url: string; path: string }>>([]);
  const [logoSource, setLogoSource] = useState<'custom' | 'global' | 'store' | null>(null);

  const isAdminOrManager = userProfile?.role === 'admin' || userProfile?.role === 'manager';
  const currentBranchId = offlineData?.currentBranchId;

  // Load current branch logo, global logos, and determine logo source
  useEffect(() => {
    const loadLogos = async () => {
      if (!currentBranchId || !offlineData?.getBranchLogo) return;
      
      try {
        const storeId = userProfile?.store_id;
        if (storeId) {
          // Load global logos
          if (offlineData?.getGlobalLogos) {
            const logos = await offlineData.getGlobalLogos();
            setGlobalLogos(logos);
          }
          
          // Load branch data to check logo source
          const branch = await offlineData.getBranchById(currentBranchId);
          
          if (branch) {
            // Check if branch has logo (can be custom base64 or global logo URL)
            if (branch.logo) {
              setLogo(branch.logo);
              setLogoPreview(branch.logo);
              // Determine if it's a URL (global) or base64 (custom)
              if (branch.logo.startsWith('http://') || branch.logo.startsWith('https://')) {
                setLogoSource('global');
              } else {
                setLogoSource('custom');
              }
            }
            // Fallback to store logo
            else {
              const store = await offlineData.getStore(storeId);
              if (store?.logo) {
                setLogoPreview(store.logo);
                setLogoSource('store');
              } else {
                setLogoPreview(null);
                setLogoSource(null);
              }
            }
          }
        }
      } catch (error) {
        handleError(error);
      }
    };

    loadLogos();
  }, [currentBranchId, offlineData?.getBranchLogo, offlineData?.getStore, offlineData?.getGlobalLogos, userProfile?.store_id]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      setError('File size too large. Please choose an image under 2MB.');
      e.target.value = '';
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      e.target.value = '';
      return;
    }

    setError(null);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setLogo(base64);
      setLogoPreview(base64);
      setLogoSource('custom');
      setUploading(false);
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectGlobalLogo = (logoUrl: string) => {
    console.log('🖼️ Global logo selected:', logoUrl);
    const selectedLogo = globalLogos.find(logo => logo.url === logoUrl);
    if (selectedLogo) {
      setLogo(logoUrl);
      setLogoPreview(logoUrl);
      setLogoSource('global');
      console.log('✅ Global logo state updated');
    } else {
      console.warn('⚠️ Selected logo not found in globalLogos');
    }
  };

  const handleSave = async () => {
    console.log('🔄 handleSave called for logo', { currentBranchId, hasUpdateBranch: !!offlineData?.updateBranch, logo: logo ? 'present' : 'null' });
    
    if (!currentBranchId) {
      const errorMsg = 'Branch not available. Please select a branch.';
      setError(errorMsg);
      return;
    }
    
    if (!offlineData?.updateBranch) {
      const errorMsg = 'Update function not available. Please refresh the page.';
      setError(errorMsg);
      return;
    }

    try {
      setUploading(true);
      setError(null);
      
      // Save logo (can be base64 for custom or URL for global)
      const updates: any = {
        logo: logo || null
      };
      
      console.log('💾 Saving branch logo:', { branchId: currentBranchId, logoType: logo ? (logo.startsWith('http') ? 'URL' : 'base64') : 'null' });
      
      await offlineData.updateBranch(currentBranchId, updates);
      
      console.log('✅ Branch logo saved successfully');
      setSaveMessage('Branch logo saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      handleError(error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to save branch logo';
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!currentBranchId || !offlineData?.updateBranch) {
      setError('Branch not available');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      
      await offlineData.updateBranch(currentBranchId, { logo: null });
      
      setLogo(null);
      setLogoPreview(null);
      setLogoSource(null);
      setSaveMessage('Branch logo removed successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      handleError(error);
      setError('Failed to remove branch logo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {saveMessage && (
        <div className="flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
          <CheckCircle className="w-5 h-5 mr-2" />
          {saveMessage}
        </div>
      )}
      {error && (
        <div className="flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-32 h-32 border-2 border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
            {logoPreview ? (
              <img 
                src={logoPreview} 
                alt="Branch Logo Preview" 
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-gray-400 text-sm">No logo</span>
            )}
          </div>
        </div>
        
        <div className="flex-1 space-y-4">
          {/* Global Logos Selection */}
          {globalLogos.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select from Global Logos
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Global logos are managed by Super Admin and available to all branches.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {globalLogos.map((globalLogo) => (
                  <div
                    key={globalLogo.url}
                    onClick={() => handleSelectGlobalLogo(globalLogo.url)}
                    className={`relative border-2 rounded-lg p-2 cursor-pointer transition-all ${
                      logo === globalLogo.url
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="w-full h-20 border border-gray-200 rounded flex items-center justify-center bg-white overflow-hidden mb-2">
                      <img 
                        src={globalLogo.url} 
                        alt={globalLogo.name || 'Global Logo'} 
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <p className="text-xs text-center text-gray-700 truncate">
                      {globalLogo.name || 'Unnamed Logo'}
                    </p>
                    {logo === globalLogo.url && (
                      <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-1">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Custom Branch Logo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={!isAdminOrManager || uploading}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              Supported formats: PNG, JPEG, WebP. Max size: 2MB
            </p>
          </div>
          
          {isAdminOrManager && (
            <div className="flex gap-2">
              {logoPreview && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Save Logo button clicked');
                    handleSave();
                  }}
                  disabled={uploading}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {uploading ? 'Saving...' : 'Save Logo Selection'}
                </button>
              )}
              {(logoSource === 'custom' || logoSource === 'global') && (
                <button
                  onClick={handleRemove}
                  disabled={uploading}
                  className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </button>
              )}
            </div>
          )}
          
          <p className="text-xs text-gray-500">
            {logoSource === 'global' 
              ? `Currently using global logo: "${globalLogos.find(l => l.url === logo)?.name || 'Selected'}". Upload a custom logo to override it.`
              : logoSource === 'custom'
              ? 'Currently using custom branch logo. This takes priority over global logos.'
              : logoSource === 'store'
              ? 'Currently using store logo. Select a global logo or upload a custom one to override.'
              : 'Select a global logo or upload a custom branch logo. Custom logos take priority.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// Branch Info Section Component
function BranchInfoSection() {
  const { userProfile } = useSupabaseAuth();
  const offlineData = useOfflineData();
  
  // Check if user is admin (only admin can edit)
  const isAdmin = userProfile?.role === 'admin';
  // Check if user can view (admin, manager, or cashier)
  const canView = userProfile?.role === 'admin' || userProfile?.role === 'manager' || userProfile?.role === 'cashier';
  
  // Get current branch from context
  const currentBranchId = offlineData?.currentBranchId;
  const branches = offlineData?.branches || [];
  const currentBranch = currentBranchId ? branches.find(b => b.id === currentBranchId) : null;
  
  const [tempBranch, setTempBranch] = useState({
    name: currentBranch?.name || '',
    address: currentBranch?.address || '',
    phone: currentBranch?.phone || ''
  });
  const [showSaveMessage, setShowSaveMessage] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Update temp state when branch changes
  useEffect(() => {
    if (currentBranch) {
      console.log('🔄 BranchInfoSection: currentBranch updated', {
        id: currentBranch.id,
        name: currentBranch.name,
        address: currentBranch.address,
        phone: currentBranch.phone
      });
      setTempBranch({
        name: currentBranch.name || '',
        address: currentBranch.address || '',
        phone: currentBranch.phone || ''
      });
    }
  }, [currentBranch?.id, currentBranch?.name, currentBranch?.address, currentBranch?.phone]);
  
  const handleSave = async () => {
    console.log('🔘 handleSave called for branch info:', { 
      currentBranchId, 
      isAdmin, 
      hasUpdateBranch: !!offlineData?.updateBranch,
      tempBranch 
    });
    
    if (!currentBranchId) {
      setSaveError('No branch selected');
      setTimeout(() => setSaveError(null), 3000);
      return;
    }
    
    if (!isAdmin) {
      setSaveError('Only admins can update branch information');
      setTimeout(() => setSaveError(null), 3000);
      return;
    }
    
    if (!offlineData?.updateBranch) {
      setSaveError('Update function not available. Please refresh the page.');
      setTimeout(() => setSaveError(null), 3000);
      return;
    }
    
    try {
      console.log('💾 Calling updateBranch with:', {
        id: currentBranchId,
        updates: {
          name: tempBranch.name,
          address: tempBranch.address || null,
          phone: tempBranch.phone || null
        }
      });
      
      await offlineData.updateBranch(currentBranchId, {
        name: tempBranch.name,
        address: tempBranch.address || null,
        phone: tempBranch.phone || null
      });
      
      console.log('✅ Branch update completed successfully');
      setShowSaveMessage(true);
      setSaveError(null);
      setTimeout(() => setShowSaveMessage(false), 2000);
    } catch (error) {
      handleError(error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to save branch information';
      setSaveError(errorMsg);
      setTimeout(() => setSaveError(null), 3000);
    }
  };
  
  const handleInputChange = (field: string, value: string) => {
    setTempBranch((prev) => ({
      ...prev,
      [field]: value
    }));
  };
  
  if (!canView) {
    return null;
  }
  
  if (!currentBranch) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg">
        <p className="text-gray-600">No branch information available.</p>
      </div>
    );
  }
  
  const hasChanges = 
    tempBranch.name !== (currentBranch.name || '') ||
    tempBranch.address !== (currentBranch.address || '') ||
    tempBranch.phone !== (currentBranch.phone || '');
  
  return (
    <div className="space-y-4">
      {/* Save Message */}
      {showSaveMessage && (
        <div className="flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
          <CheckCircle className="w-5 h-5 mr-2" />
          Branch information saved successfully!
        </div>
      )}
      {saveError && (
        <div className="flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {saveError}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Branch Name
          </label>
          <input
            type="text"
            value={tempBranch.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            placeholder="Branch Name"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="text"
            value={tempBranch.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            disabled={!isAdmin}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            placeholder="Phone Number"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address
        </label>
        <input
          type="text"
          value={tempBranch.address}
          onChange={(e) => handleInputChange('address', e.target.value)}
          disabled={!isAdmin}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
          placeholder="Branch Address"
        />
      </div>
      
      {/* Save Button - Only for Admin */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Branch Information
          </button>
        </div>
      )}
    </div>
  );
}