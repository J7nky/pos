import React, { useState } from 'react';
import { useQRCodeGeneration } from '../hooks/useQRCodeGeneration';
import QRCodeDisplay from '../components/QRCodeDisplay';
import { QrCode, Smartphone, ExternalLink } from 'lucide-react';

export default function QRCodeDemo() {
  const { generateQRCode, qrCodeDataUrl, qrCodeUrl, isLoading, error } = useQRCodeGeneration();
  const [demoData, setDemoData] = useState({
    customerId: 'demo-customer-123',
    billId: 'demo-bill-456',
    billNumber: 'BILL-20240101-001',
    customerName: 'John Doe'
  });

  const handleGenerateQR = async () => {
    try {
      await generateQRCode(
        demoData.customerId,
        demoData.billId,
        demoData.billNumber,
        demoData.customerName
      );
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setDemoData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <QrCode className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">QR Code Integration Demo</h1>
          </div>
          <p className="text-gray-600 mb-6">
            This demo shows how QR codes are generated for bills with customer account statement links.
            When customers scan the QR code with their phone, they'll be taken to their account statement page.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Demo Data</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer ID
                </label>
                <input
                  type="text"
                  value={demoData.customerId}
                  onChange={(e) => handleInputChange('customerId', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bill ID
                </label>
                <input
                  type="text"
                  value={demoData.billId}
                  onChange={(e) => handleInputChange('billId', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bill Number
                </label>
                <input
                  type="text"
                  value={demoData.billNumber}
                  onChange={(e) => handleInputChange('billNumber', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={demoData.customerName}
                  onChange={(e) => handleInputChange('customerName', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleGenerateQR}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Generating...' : 'Generate QR Code'}
              </button>
            </div>
          </div>

          {/* QR Code Display */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Generated QR Code</h2>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {qrCodeDataUrl ? (
              <div className="text-center">
                <QRCodeDisplay
                  customerId={demoData.customerId}
                  billId={demoData.billId}
                  billNumber={demoData.billNumber}
                  customerName={demoData.customerName}
                  size={250}
                  showLabel={true}
                />
                
                {qrCodeUrl && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">QR Code URL:</p>
                    <code className="text-xs text-gray-800 break-all bg-white p-2 rounded border block">
                      {qrCodeUrl}
                    </code>
                    <a
                      href={qrCodeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm mt-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open in new tab</span>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <QrCode className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Click "Generate QR Code" to see the result</p>
              </div>
            )}
          </div>
        </div>

        {/* Implementation Details */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Implementation Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">How it works:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• QR code contains URL to public customer statement page</li>
                <li>• URL format: <code>/public/customer-statement/&#123;customerId&#125;/&#123;billId&#125;</code></li>
                <li>• No authentication required for public access</li>
                <li>• Mobile-optimized account statement display</li>
                <li>• Includes bill details and customer transaction history</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Integration points:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Generated during bill creation in POS system</li>
                <li>• Added to receipt printing for customer bills</li>
                <li>• Only shown when customer is selected</li>
                <li>• Uses existing account statement service</li>
                <li>• Works with both online and offline modes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cost Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Cost Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Development Cost</h3>
              <p className="text-2xl font-bold text-green-600">$0</p>
              <p className="text-sm text-gray-600">Already implemented</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Hosting Cost</h3>
              <p className="text-2xl font-bold text-blue-600">$0-5/month</p>
              <p className="text-sm text-gray-600">Minimal additional cost</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">Maintenance</h3>
              <p className="text-2xl font-bold text-purple-600">$0</p>
              <p className="text-sm text-gray-600">No ongoing maintenance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
