import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
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
  DollarSign
} from 'lucide-react';

export default function Settings() {
  const { 
    lowStockAlertsEnabled, 
    lowStockThreshold, 
    defaultCommissionRate,
    currency,
    toggleLowStockAlerts, 
    updateLowStockThreshold,
    updateDefaultCommissionRate,
    updateCurrency
  } = useData();
  const { user } = useAuth();

  const [tempThreshold, setTempThreshold] = useState(lowStockThreshold.toString());
  const [tempCommissionRate, setTempCommissionRate] = useState(defaultCommissionRate.toString());
  const [tempCurrency, setTempCurrency] = useState<'USD' | 'LBP'>(currency);
  const [showSaveMessage, setShowSaveMessage] = useState(false);

  const handleThresholdSave = () => {
    const newThreshold = parseInt(tempThreshold);
    if (newThreshold > 0) {
      updateLowStockThreshold(newThreshold);
      setShowSaveMessage(true);
      setTimeout(() => setShowSaveMessage(false), 2000);
    }
  };

  const handleCommissionRateSave = () => {
    const newRate = parseFloat(tempCommissionRate);
    if (newRate >= 0 && newRate <= 100) {
      updateDefaultCommissionRate(newRate);
      setShowSaveMessage(true);
      setTimeout(() => setShowSaveMessage(false), 2000);
    }
  };

  const handleCurrencySave = () => {
    updateCurrency(tempCurrency);
    setShowSaveMessage(true);
    setTimeout(() => setShowSaveMessage(false), 2000);
  };

  const handleToggleAlerts = (enabled: boolean) => {
    toggleLowStockAlerts(enabled);
    setShowSaveMessage(true);
    setTimeout(() => setShowSaveMessage(false), 2000);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        {showSaveMessage && (
          <div className="flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
            <CheckCircle className="w-5 h-5 mr-2" />
            Settings saved successfully!
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* User Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <User className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">User Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                type="text"
                value={user?.name || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <input
                type="text"
                value={user?.role || ''}
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
            <h2 className="text-xl font-semibold text-gray-900">Inventory Alerts</h2>
          </div>
          
          <div className="space-y-4">
            {/* Low Stock Alerts Toggle */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mr-3" />
                <div>
                  <h3 className="font-medium text-gray-900">Low Stock Alerts</h3>
                  <p className="text-sm text-gray-600">Get notified when products are running low</p>
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
                  <h3 className="font-medium text-gray-900">Low Stock Threshold</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Alert when product quantity falls below this number
                </p>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={tempThreshold}
                    onChange={(e) => setTempThreshold(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-gray-600">units</span>
                  <button
                    onClick={handleThresholdSave}
                    disabled={tempThreshold === lowStockThreshold.toString()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Current threshold: {lowStockThreshold} units
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Commission Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Calculator className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Commission Settings</h2>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-3">
                <DollarSign className="w-5 h-5 text-green-500 mr-3" />
                <h3 className="font-medium text-gray-900">Default Commission Rate</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Default commission percentage for new commission-based product receives
              </p>
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
                  disabled={tempCommissionRate === defaultCommissionRate.toString()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Current default rate: {defaultCommissionRate}% (can be overridden per transaction)
              </p>
            </div>
          </div>
        </div>

        {/* Currency Settings */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <DollarSign className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Currency Settings</h2>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center mb-3">
                <DollarSign className="w-5 h-5 text-blue-500 mr-3" />
                <h3 className="font-medium text-gray-900">Display Currency</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Choose the currency for displaying prices throughout the application
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
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Current currency: {currency === 'USD' ? 'USD ($)' : 'LBP (ل.ل)'}
              </p>
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Database className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">System Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Application Version</h3>
              <p className="text-gray-600">ProducePOS v1.0.0</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Data Storage</h3>
              <p className="text-gray-600">Local Storage (Offline-first)</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Last Sync</h3>
              <p className="text-gray-600">Never (Local only)</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Device Type</h3>
              <div className="flex items-center text-gray-600">
                <Smartphone className="w-4 h-4 mr-2" />
                Web Application
              </div>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <Shield className="w-6 h-6 text-gray-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Security</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Session Management</h3>
              <p className="text-sm text-gray-600 mb-3">
                Your session will remain active until you manually log out
              </p>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                Change Password
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}