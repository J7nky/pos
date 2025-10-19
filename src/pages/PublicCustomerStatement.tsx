import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  Calendar, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  CreditCard,
  Users,
  Truck,
  BarChart3,
  List,
  Info,
  Smartphone,
  QrCode
} from 'lucide-react';
import { AccountStatement, AccountStatementService } from '../services/accountStatementService';
import { Customer, Supplier, Transaction, InventoryItem, Product } from '../types';
import { BillLineItem } from '../lib/db';

interface PublicCustomerStatementProps {
  // This component will be used in a public route, so it needs to fetch its own data
}

export default function PublicCustomerStatement() {
  const { customerId, billId } = useParams<{ customerId: string; billId: string }>();
  const navigate = useNavigate();
  
  // Debug logging
  console.log('🔍 PublicCustomerStatement loaded:');
  console.log('   - Customer ID:', customerId);
  console.log('   - Bill ID:', billId);
  console.log('   - Current URL:', window.location.href);
  
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bill, setBill] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (customerId && billId) {
      loadCustomerStatement();
    }
  }, [customerId, billId, dateRange, viewMode]);

  const loadCustomerStatement = async () => {
    if (!customerId || !billId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Create mock data for demonstration
      const mockCustomer: Customer = {
        id: customerId,
        name: `Customer ${customerId}`,
        email: `customer${customerId}@example.com`,
        phone: '+1234567890',
        address: '123 Main St, City, Country',
        isActive: true,
        createdAt: new Date().toISOString(),
        lb_balance: 0,
        usd_balance: 0
      };

      const mockBill = {
        id: billId,
        bill_number: `BILL-${billId}`,
        customer_id: customerId,
        total_amount: 150.00,
        paid_amount: 150.00,
        status: 'paid',
        created_at: new Date().toISOString(),
        items: [
          {
            product_name: 'Sample Product 1',
            quantity: 2,
            unit_price: 50.00,
            total_price: 100.00
          },
          {
            product_name: 'Sample Product 2',
            quantity: 1,
            unit_price: 50.00,
            total_price: 50.00
          }
        ]
      };

      const mockStatement: AccountStatement = {
        customer: mockCustomer,
        currentBalance: 0,
        totalPurchases: 150.00,
        totalPayments: 150.00,
        transactions: [
          {
            id: '1',
            type: 'sale',
            amount: 150.00,
            description: `Bill ${mockBill.bill_number}`,
            date: mockBill.created_at,
            balance: 0
          }
        ],
        bills: [mockBill]
      };

      setCustomer(mockCustomer);
      setBill(mockBill);
      setStatement(mockStatement);
      
    } catch (err) {
      console.error('Error loading customer statement:', err);
      setError('Failed to load customer statement. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Generate PDF or export functionality
    console.log('Download functionality to be implemented');
  };

  const formatCurrency = (amount: number, currency: 'USD' | 'LBP' = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading account statement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Statement</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.close()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.close()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Account Statement</h1>
                <p className="text-gray-600">Scanned from QR code on receipt</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 text-sm text-gray-500">
                <Smartphone className="w-4 h-4" />
                <span>Mobile View</span>
              </div>
              <div className="flex items-center space-x-1 text-sm text-gray-500">
                <QrCode className="w-4 h-4" />
                <span>QR Code Access</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Demo Content */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">QR Code Integration Demo</h2>
            <p className="text-gray-600 mb-4">
              This page demonstrates how customers can access their account statements by scanning QR codes from their receipts.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">QR Code URL Structure:</h3>
              <code className="text-sm text-gray-700 break-all">
                {import.meta.env.VITE_PUBLIC_URL || window.location.origin}/public/customer-statement/{customerId}/{billId}
              </code>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Customer ID</label>
              <p className="text-gray-900">{customerId}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Bill ID</label>
              <p className="text-gray-900">{billId}</p>
            </div>
          </div>
        </div>

        {/* Implementation Notes */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Implementation Requirements</h3>
          <div className="space-y-3 text-blue-800">
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p>Create public API endpoints to serve customer and bill data</p>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p>Implement authentication-free access to account statements</p>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p>Add QR code generation to bill creation process</p>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p>Integrate QR codes into receipt printing</p>
            </div>
            <div className="flex items-start space-x-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p>Ensure mobile-responsive design for phone scanning</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4 mt-6">
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-5 h-5" />
            <span>Print Statement</span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center space-x-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t mt-12">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="text-center text-sm text-gray-500">
            <p>This account statement was accessed via QR code from your receipt</p>
            <p className="mt-1">Generated on {new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
