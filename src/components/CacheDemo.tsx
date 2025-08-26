import React from 'react';
import { useQueryCache, usePreloadCache } from '../hooks/useQueryCache';
import { useSupabase } from '../hooks/useSupabase';

interface Bill {
  id: string;
  bill_number: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface Store {
  id: string;
  name: string;
  address: string;
}

const CacheDemo: React.FC = () => {
  const { supabase } = useSupabase();
  
  // Preload frequently accessed data
  const { preloading, preloaded } = usePreloadCache(supabase);

  // Cache bills with 2-minute TTL
  const {
    data: bills,
    loading: billsLoading,
    error: billsError,
    refetch: refetchBills,
    clearCache: clearBillsCache,
    cacheStats: billsCacheStats
  } = useQueryCache<Bill[]>(
    supabase,
    'bills:recent',
    () => supabase.from('bills').select('*').order('created_at', { ascending: false }).limit(10),
    { ttl: 2 * 60 * 1000 } // 2 minutes
  );

  // Cache stores with 10-minute TTL
  const {
    data: stores,
    loading: storesLoading,
    error: storesError,
    refetch: refetchStores,
    clearCache: clearStoresCache,
    cacheStats: storesCacheStats
  } = useQueryCache<Store[]>(
    supabase,
    'stores:all',
    () => supabase.from('stores').select('*'),
    { ttl: 10 * 60 * 1000 } // 10 minutes
  );

  // Cache products with 15-minute TTL
  const {
    data: products,
    loading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
    clearCache: clearProductsCache,
    cacheStats: productsCacheStats
  } = useQueryCache<any[]>(
    supabase,
    'products:all',
    () => supabase.from('products').select('*'),
    { ttl: 15 * 60 * 1000 } // 15 minutes
  );

  const handleForceRefresh = async () => {
    await Promise.all([
      refetchBills(),
      refetchStores(),
      refetchProducts()
    ]);
  };

  const handleClearAllCache = () => {
    clearBillsCache();
    clearStoresCache();
    clearProductsCache();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🚀 Query Cache Demo</h1>
      
      {/* Preload Status */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">📦 Data Preloading</h2>
        {preloading ? (
          <p className="text-blue-600">🔄 Preloading frequently accessed data...</p>
        ) : (
          <div>
            <p className="text-green-600">✅ Preloaded data:</p>
            <ul className="list-disc list-inside ml-4">
              {preloaded.map(item => (
                <li key={item} className="text-sm">{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Cache Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">📊 Bills Cache Stats</h3>
          <div className="text-sm space-y-1">
            <p>Size: {billsCacheStats.size}/{billsCacheStats.maxSize}</p>
            <p>Hit Rate: {(billsCacheStats.hitRate * 100).toFixed(1)}%</p>
            <p>Total Hits: {billsCacheStats.totalHits}</p>
          </div>
        </div>
        
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">📊 Stores Cache Stats</h3>
          <div className="text-sm space-y-1">
            <p>Size: {storesCacheStats.size}/{storesCacheStats.maxSize}</p>
            <p>Hit Rate: {(storesCacheStats.hitRate * 100).toFixed(1)}%</p>
            <p>Total Hits: {storesCacheStats.totalHits}</p>
          </div>
        </div>
        
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">📊 Products Cache Stats</h3>
          <div className="text-sm space-y-1">
            <p>Size: {productsCacheStats.size}/{productsCacheStats.maxSize}</p>
            <p>Hit Rate: {(productsCacheStats.hitRate * 100).toFixed(1)}%</p>
            <p>Total Hits: {productsCacheStats.totalHits}</p>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleForceRefresh}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          🔄 Force Refresh All
        </button>
        <button
          onClick={handleClearAllCache}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          🗑️ Clear All Cache
        </button>
      </div>

      {/* Data Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bills */}
        <div className="p-4 border rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">📋 Recent Bills</h3>
            <div className="flex gap-2">
              <button
                onClick={refetchBills}
                className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
              >
                🔄
              </button>
              <button
                onClick={clearBillsCache}
                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              >
                🗑️
              </button>
            </div>
          </div>
          
          {billsLoading ? (
            <p className="text-gray-500">Loading bills...</p>
          ) : billsError ? (
            <p className="text-red-500">Error: {billsError.message}</p>
          ) : bills && bills.length > 0 ? (
            <div className="space-y-2">
              {bills.map(bill => (
                <div key={bill.id} className="p-2 bg-gray-50 rounded text-sm">
                  <p><strong>{bill.bill_number}</strong> - ${bill.total_amount}</p>
                  <p className="text-gray-600">{bill.status} • {new Date(bill.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No bills found</p>
          )}
        </div>

        {/* Stores */}
        <div className="p-4 border rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">🏪 Stores</h3>
            <div className="flex gap-2">
              <button
                onClick={refetchStores}
                className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
              >
                🔄
              </button>
              <button
                onClick={clearStoresCache}
                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              >
                🗑️
              </button>
            </div>
          </div>
          
          {storesLoading ? (
            <p className="text-gray-500">Loading stores...</p>
          ) : storesError ? (
            <p className="text-red-500">Error: {storesError.message}</p>
          ) : stores && stores.length > 0 ? (
            <div className="space-y-2">
              {stores.map(store => (
                <div key={store.id} className="p-2 bg-gray-50 rounded text-sm">
                  <p><strong>{store.name}</strong></p>
                  <p className="text-gray-600">{store.address}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No stores found</p>
          )}
        </div>
      </div>

      {/* Performance Tips */}
      <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">💡 Performance Tips</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Cache TTL is set based on data freshness requirements</li>
          <li>Bills: 2 minutes (frequently changing)</li>
          <li>Stores: 10 minutes (rarely changing)</li>
          <li>Products: 15 minutes (moderately changing)</li>
          <li>Use Force Refresh when you need fresh data</li>
          <li>Clear cache when data becomes stale</li>
        </ul>
      </div>
    </div>
  );
};

export default CacheDemo;

