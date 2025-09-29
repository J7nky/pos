import React, { useState, useEffect } from 'react';
import { thermalPrinter, PrinterConfig } from '../services/thermalPrinterService';
import AccessibleButton from './common/AccessibleButton';
import AccessibleModal from './common/AccessibleModal';

interface PrinterSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrinterSettings({ isOpen, onClose }: PrinterSettingsProps) {
  const [config, setConfig] = useState<PrinterConfig>({
    width: 42,
    encoding: 'utf8',
    autoCut: true,
    autoOpenDrawer: false
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load current configuration
      const currentConfig = thermalPrinter.getConfig();
      setConfig(currentConfig);
      setIsConnected(thermalPrinter.isPrinterConnected());
    }
  }, [isOpen]);

  const handleConfigChange = (field: keyof PrinterConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    thermalPrinter.updateConfig(config);
    onClose();
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const success = await thermalPrinter.testPrint();
      setTestResult({
        success,
        message: success ? 'Test print successful!' : 'Test print failed'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Test print error: ${error}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleInitialize = async () => {
    try {
      const success = await thermalPrinter.initialize();
      setIsConnected(success);
      if (success) {
        setTestResult({
          success: true,
          message: 'Printer initialized successfully!'
        });
      } else {
        setTestResult({
          success: false,
          message: 'Failed to initialize printer'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Initialization error: ${error}`
      });
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Thermal Printer Settings"
      size="lg"
    >
      <div className="p-6 space-y-6">
        {/* Connection Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Connection Status</h3>
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
            <AccessibleButton
              onClick={handleInitialize}
              variant="secondary"
              size="sm"
            >
              Initialize
            </AccessibleButton>
          </div>
        </div>

        {/* Printer Configuration */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Printer Configuration</h3>
          
          {/* Paper Width */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paper Width (characters)
            </label>
            <select
              value={config.width}
              onChange={(e) => handleConfigChange('width', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={32}>32 characters (58mm)</option>
              <option value={42}>42 characters (80mm)</option>
              <option value={48}>48 characters (80mm wide)</option>
            </select>
          </div>

          {/* Encoding */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Text Encoding
            </label>
            <select
              value={config.encoding}
              onChange={(e) => handleConfigChange('encoding', e.target.value as 'utf8' | 'ascii')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="utf8">UTF-8 (Recommended)</option>
              <option value="ascii">ASCII</option>
            </select>
          </div>

          {/* Auto Cut */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="autoCut"
              checked={config.autoCut}
              onChange={(e) => handleConfigChange('autoCut', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="autoCut" className="ml-2 block text-sm text-gray-900">
              Auto cut paper after printing
            </label>
          </div>

          {/* Auto Open Drawer */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="autoOpenDrawer"
              checked={config.autoOpenDrawer}
              onChange={(e) => handleConfigChange('autoOpenDrawer', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="autoOpenDrawer" className="ml-2 block text-sm text-gray-900">
              Auto open cash drawer after printing
            </label>
          </div>
        </div>

        {/* Test Print */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Test Printer</h3>
          <p className="text-sm text-gray-600 mb-4">
            Send a test print to verify your printer is working correctly.
          </p>
          <div className="flex items-center space-x-3">
            <AccessibleButton
              onClick={handleTestPrint}
              variant="primary"
              size="sm"
              loading={isTesting}
              disabled={!isConnected}
            >
              {isTesting ? 'Testing...' : 'Test Print'}
            </AccessibleButton>
            {testResult && (
              <div className={`text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        {/* Store Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Store Information</h3>
          <p className="text-sm text-gray-600">
            Store information will appear on receipts. This can be configured in the main settings.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <div>Store Name: Your Store Name</div>
            <div>Address: Your Store Address</div>
            <div>Phone: Your Store Phone</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <AccessibleButton
            onClick={onClose}
            variant="secondary"
          >
            Cancel
          </AccessibleButton>
          <AccessibleButton
            onClick={handleSave}
            variant="primary"
          >
            Save Settings
          </AccessibleButton>
        </div>
      </div>
    </AccessibleModal>
  );
}
