import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Database, Wifi, WifiOff, Plus, Check, X } from 'lucide-react';

export default function OfflineDemo() {
  const { 
    addProduct, 
    addCustomer, 
    addInventoryItem, 
    getSyncStatus, 
    sync,
    products,
    customers,
    inventory 
  } = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const { isOnline, unsyncedCount, isSyncing } = getSyncStatus();
  
  const [demoResults, setDemoResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addLogEntry = (message: string) => {
    setDemoResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runOfflineDemo = async () => {
    setIsRunning(true);
    setDemoResults([]);
    
    try {
      addLogEntry('🚀 Starting Offline-First Demo...');
      
      // Test 1: Add a product
      addLogEntry('📦 Adding demo product...');
      await addProduct({
        name: `Demo Product ${Date.now()}`,
        category: 'Demo',
        image: '/api/placeholder/150/150',
        is_active: true
      });
      addLogEntry('✅ Product added to local database instantly!');
      
      // Test 2: Add a customer
      addLogEntry('👤 Adding demo customer...');
      await addCustomer({
        name: `Demo Customer ${Date.now()}`,
        phone: '+1234567890',
        email: 'demo@example.com',
        address: '123 Demo Street',
        current_debt: 0,
        is_active: true
      });
      addLogEntry('✅ Customer added to local database instantly!');
      
      // Test 3: Add inventory
      if (products.length > 0) {
        addLogEntry('📋 Adding demo inventory...');
        await addInventoryItem({
          product_id: products[0].id,
          supplier_id: products[0].id, // Using product ID as placeholder
          type: 'cash',
          quantity: 100,
          unit: 'piece',
          weight: 50.5,
          price: 10.99,
          received_by: userProfile?.id || 'demo-user'
        });
        addLogEntry('✅ Inventory added to local database instantly!');
      }
      
      addLogEntry(`🔄 All operations completed ${isOnline ? 'ONLINE' : 'OFFLINE'}!`);
      addLogEntry(`📊 Current unsynced items: ${unsyncedCount}`);
      
      if (isOnline && unsyncedCount > 0) {
        addLogEntry('⬆️ Triggering sync to cloud...');
        const result = await sync();
        if (result.success) {
          addLogEntry(`✅ Sync completed! Uploaded: ${result.synced.uploaded}, Downloaded: ${result.synced.downloaded}`);
        } else {
          addLogEntry(`❌ Sync failed: ${result.errors.join(', ')}`);
        }
      } else if (!isOnline) {
        addLogEntry('📱 Working offline - data will sync when connection returns!');
      }
      
    } catch (error) {
      addLogEntry(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Offline-First POS Demo</h2>
            <p className="text-gray-600">Test the instant response and automatic sync capabilities</p>
          </div>
        </div>

        {/* Connection Status */}
        <div className="mb-6 p-4 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
              <span className={`font-medium ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>Products: {products.length}</span>
              <span>Customers: {customers.length}</span>
              <span>Inventory: {inventory.length}</span>
              {unsyncedCount > 0 && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                  {unsyncedCount} unsynced
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Demo Controls */}
        <div className="mb-6">
          <button
            onClick={runOfflineDemo}
            disabled={isRunning || isSyncing}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            {isRunning ? 'Running Demo...' : 'Run Offline Demo'}
          </button>
        </div>

        {/* Demo Results */}
        {demoResults.length > 0 && (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
            <h3 className="text-white mb-3 font-bold">Demo Output:</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {demoResults.map((result, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-gray-500">{index + 1}.</span>
                  <span>{result}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">What This Demo Shows:</h3>
          <ul className="space-y-1 text-blue-800 text-sm">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <span>Instant responses - all operations use local database first</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <span>Works offline - try disconnecting your internet!</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <span>Automatic sync - data uploads to cloud when online</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <span>No data loss - everything saved locally first</span>
            </li>
          </ul>
        </div>

        {/* Try Offline Instructions */}
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h3 className="font-semibold text-yellow-900 mb-2">Try This:</h3>
          <p className="text-yellow-800 text-sm">
            1. Run the demo while online to see normal operation<br/>
            2. Disconnect your internet connection<br/>
            3. Run the demo again - notice it still works instantly!<br/>
            4. Reconnect internet - watch the data automatically sync to the cloud
          </p>
        </div>
      </div>
    </div>
  );
} 