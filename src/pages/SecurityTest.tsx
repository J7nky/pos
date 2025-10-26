import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SecurityTest() {
  const [results, setResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);

  const testDirectAccess = async () => {
    setIsLoading(true);
    const testResults: any = {};

    try {
      // Test 1: Try to fetch ALL customers without any token
      console.log('🔍 Testing direct access to customers table...');
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .limit(10);
      
      testResults.customers = {
        success: !customersError,
        error: customersError?.message,
        count: customers?.length || 0,
        sample: customers?.slice(0, 3) || []
      };

      // Test 2: Try to fetch ALL bill_line_items
      console.log('🔍 Testing direct access to bill_line_items table...');
      const { data: billItems, error: billItemsError } = await supabase
        .from('bill_line_items')
        .select('*')
        .limit(10);
      
      testResults.billItems = {
        success: !billItemsError,
        error: billItemsError?.message,
        count: billItems?.length || 0,
        sample: billItems?.slice(0, 3) || []
      };

      // Test 3: Try to fetch ALL transactions
      console.log('🔍 Testing direct access to transactions table...');
      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .limit(10);
      
      testResults.transactions = {
        success: !transactionsError,
        error: transactionsError?.message,
        count: transactions?.length || 0,
        sample: transactions?.slice(0, 3) || []
      };

      // Test 4: Try to fetch ALL bills
      console.log('🔍 Testing direct access to bills table...');
      const { data: bills, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .limit(10);
      
      testResults.bills = {
        success: !billsError,
        error: billsError?.message,
        count: bills?.length || 0,
        sample: bills?.slice(0, 3) || []
      };

      // Test 5: Try to fetch ALL products
      console.log('🔍 Testing direct access to products table...');
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .limit(10);
      
      testResults.products = {
        success: !productsError,
        error: productsError?.message,
        count: products?.length || 0,
        sample: products?.slice(0, 3) || []
      };

      // Test 6: Try to fetch ALL inventory_items
      console.log('🔍 Testing direct access to inventory_items table...');
      const { data: inventory, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('*')
        .limit(10);
      
      testResults.inventory = {
        success: !inventoryError,
        error: inventoryError?.message,
        count: inventory?.length || 0,
        sample: inventory?.slice(0, 3) || []
      };

      // Test 7: Try to fetch ALL public_access_tokens
      console.log('🔍 Testing direct access to public_access_tokens table...');
      const { data: tokens, error: tokensError } = await supabase
        .from('public_access_tokens')
        .select('*')
        .limit(10);
      
      testResults.tokens = {
        success: !tokensError,
        error: tokensError?.message,
        count: tokens?.length || 0,
        sample: tokens?.slice(0, 3) || []
      };

    } catch (error) {
      console.error('❌ Test failed:', error);
      testResults.generalError = error;
    }

    setResults(testResults);
    setIsLoading(false);
  };

  const testSpecificCustomer = async () => {
    setIsLoading(true);
    const testResults: any = {};

    try {
      // First get a customer ID from the customers table
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name')
        .limit(1);

      if (customers && customers.length > 0) {
        const customerId = customers[0].id;
        const customerName = customers[0].name;

        console.log(`🔍 Testing access to specific customer: ${customerName} (${customerId})`);

        // Try to fetch data for this specific customer
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();

        testResults.specificCustomer = {
          success: !customerError,
          error: customerError?.message,
          customerId,
          customerName,
          data: customerData
        };

        // Try to fetch their transactions
        const { data: customerTransactions, error: transactionsError } = await supabase
          .from('transactions')
          .select('*')
          .eq('customer_id', customerId);

        testResults.specificCustomerTransactions = {
          success: !transactionsError,
          error: transactionsError?.message,
          count: customerTransactions?.length || 0,
          sample: customerTransactions?.slice(0, 3) || []
        };

        // Try to fetch their bills
        const { data: customerBills, error: billsError } = await supabase
          .from('bills')
          .select('*')
          .eq('customer_id', customerId);

        testResults.specificCustomerBills = {
          success: !billsError,
          error: billsError?.message,
          count: customerBills?.length || 0,
          sample: customerBills?.slice(0, 3) || []
        };
      }

    } catch (error) {
      console.error('❌ Specific customer test failed:', error);
      testResults.specificCustomerError = error;
    }

    setResults(prev => ({ ...prev, ...testResults }));
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            🔒 Security Test - Direct Database Access
          </h1>
          <p className="text-gray-600 mb-6">
            This page tests if anonymous users can access your data directly without any authentication.
            <br />
            <strong className="text-red-600">If any test shows "success: true", your data is NOT secure!</strong>
          </p>

          <div className="flex space-x-4 mb-6">
            <button
              onClick={testDirectAccess}
              disabled={isLoading}
              className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {isLoading ? 'Testing...' : 'Test Direct Access to All Tables'}
            </button>
            
            <button
              onClick={testSpecificCustomer}
              disabled={isLoading}
              className="bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {isLoading ? 'Testing...' : 'Test Access to Specific Customer'}
            </button>
          </div>
        </div>

        {Object.keys(results).length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Test Results</h2>
            
            {Object.entries(results).map(([key, result]: [string, any]) => (
              <div key={key} className="mb-6 p-4 border rounded-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-2 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Success: </span>
                    <span className={`px-2 py-1 rounded text-sm ${
                      result.success ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {result.success ? '❌ VULNERABLE' : '✅ SECURE'}
                    </span>
                  </div>
                  
                  {result.count !== undefined && (
                    <div>
                      <span className="font-medium">Records Found: </span>
                      <span className="text-gray-600">{result.count}</span>
                    </div>
                  )}
                  
                  {result.error && (
                    <div className="col-span-2">
                      <span className="font-medium">Error: </span>
                      <span className="text-red-600">{result.error}</span>
                    </div>
                  )}
                </div>

                {result.sample && result.sample.length > 0 && (
                  <div className="mt-3">
                    <span className="font-medium">Sample Data: </span>
                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(result.sample, null, 2)}
                    </pre>
                  </div>
                )}

                {result.data && (
                  <div className="mt-3">
                    <span className="font-medium">Full Data: </span>
                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">⚠️ Security Assessment</h3>
          <p className="text-yellow-700">
            If any test shows "VULNERABLE", it means anonymous users can access your data without authentication.
            This is a serious security issue that needs immediate attention.
          </p>
        </div>
      </div>
    </div>
  );
}
