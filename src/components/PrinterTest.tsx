import React, { useState } from 'react';
import { thermalPrinter, ReceiptData } from '../services/thermalPrinterService';
import AccessibleButton from './common/AccessibleButton';
import AccessibleModal from './common/AccessibleModal';

interface PrinterTestProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrinterTest({ isOpen, onClose }: PrinterTestProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleSampleReceipt = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // Create a sample receipt for testing
      const sampleReceipt: ReceiptData = {
        billNumber: 'TEST-001',
        billDate: new Date().toISOString(),
        customerName: 'Test Customer',
        customerPhone: '123-456-7890',
        items: [
          {
            name: 'Sample Product 1',
            quantity: 2,
            unitPrice: 10.50,
            total: 21.00,
            weight: 1.5,
            supplier: 'Test Supplier'
          },
          {
            name: 'Sample Product 2',
            quantity: 1,
            unitPrice: 25.00,
            total: 25.00,
            supplier: 'Test Supplier'
          }
        ],
        subtotal: 46.00,
        total: 46.00,
        amountPaid: 50.00,
        change: 4.00,
        paymentMethod: 'cash',
        notes: 'This is a test receipt',
        storeName: 'Test Store',
        storeAddress: '123 Test Street, Test City',
        storePhone: '555-0123',
        cashierName: 'Test Cashier'
      };

      const success = await thermalPrinter.printReceipt(sampleReceipt);
      setTestResult({
        success,
        message: success ? 'Sample receipt printed successfully!' : 'Sample receipt print failed'
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Sample receipt error: ${error}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Test Thermal Printer"
      size="md"
    >
      <div className="p-6 space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Test Printer Functionality</h3>
          <p className="text-sm text-gray-600">
            Use these buttons to test your thermal printer connection and receipt formatting.
          </p>
        </div>

        <div className="space-y-4">
          <AccessibleButton
            onClick={handleTestPrint}
            variant="primary"
            size="lg"
            loading={isTesting}
            className="w-full"
          >
            {isTesting ? 'Testing...' : 'Send Test Print'}
          </AccessibleButton>

          <AccessibleButton
            onClick={handleSampleReceipt}
            variant="secondary"
            size="lg"
            loading={isTesting}
            className="w-full"
          >
            {isTesting ? 'Printing...' : 'Print Sample Receipt'}
          </AccessibleButton>
        </div>

        {testResult && (
          <div className={`p-4 rounded-lg ${
            testResult.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className={`text-sm ${
              testResult.success ? 'text-green-800' : 'text-red-800'
            }`}>
              {testResult.message}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 text-center">
          <p>Note: In development mode, receipts are saved to the 'receipts' folder instead of being printed.</p>
          <p>Check the console for file locations.</p>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <AccessibleButton
            onClick={onClose}
            variant="secondary"
          >
            Close
          </AccessibleButton>
        </div>
      </div>
    </AccessibleModal>
  );
}
