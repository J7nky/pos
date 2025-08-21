#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Performance test functions
const measureQueryTime = async (queryName, queryFn) => {
  const startTime = Date.now();
  const { data, error, count } = await queryFn();
  const endTime = Date.now();
  
  if (error) {
    console.error(`❌ ${queryName} failed:`, error.message);
    return { success: false, error: error.message };
  }
  
  const duration = (endTime - startTime) / 1000;
  const recordCount = count || (data ? data.length : 0);
  
  return {
    success: true,
    duration,
    recordCount,
    dataSize: JSON.stringify(data).length
  };
};

const runQueryPerformanceTest = async () => {
  console.log('🚀 Starting Database Query Performance Test...');
  console.log('🔍 Testing read operations and query performance...');
  
  try {
    // Test 1: Basic count queries
    console.log('\n📊 Test 1: Basic Count Queries');
    console.log('=' .repeat(40));
    
    const countTests = [
      {
        name: 'Count all bills',
        query: () => supabase.from('bills').select('*', { count: 'exact', head: true })
      },
      {
        name: 'Count bills by status',
        query: () => supabase.from('bills').select('*', { count: 'exact', head: true }).eq('status', 'active')
      },
      {
        name: 'Count bills by payment status',
        query: () => supabase.from('bills').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid')
      }
    ];
    
    for (const test of countTests) {
      const result = await measureQueryTime(test.name, test.query);
      if (result.success) {
        console.log(`✅ ${test.name}: ${result.recordCount.toLocaleString()} records in ${result.duration.toFixed(3)}s`);
      }
    }
    
    // Test 2: Data retrieval queries
    console.log('\n📋 Test 2: Data Retrieval Queries');
    console.log('=' .repeat(40));
    
    const retrievalTests = [
      {
        name: 'Get recent bills (limit 10)',
        query: () => supabase.from('bills').select('*').order('created_at', { ascending: false }).limit(10)
      },
      {
        name: 'Get recent bills (limit 100)',
        query: () => supabase.from('bills').select('*').order('created_at', { ascending: false }).limit(100)
      },
      {
        name: 'Get bills by date range',
        query: () => supabase.from('bills').select('*').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(50)
      },
      {
        name: 'Get bills with specific payment method',
        query: () => supabase.from('bills').select('*').eq('payment_method', 'cash').limit(50)
      }
    ];
    
    for (const test of retrievalTests) {
      const result = await measureQueryTime(test.name, test.query);
      if (result.success) {
        console.log(`✅ ${test.name}: ${result.recordCount.toLocaleString()} records in ${result.duration.toFixed(3)}s (${(result.dataSize / 1024).toFixed(1)}KB)`);
      }
    }
    
    // Test 3: Complex queries
    console.log('\n🔍 Test 3: Complex Queries');
    console.log('=' .repeat(40));
    
    const complexTests = [
      {
        name: 'Get bills with sorting and filtering',
        query: () => supabase.from('bills').select('*').eq('status', 'active').gte('total_amount', 100).order('total_amount', { ascending: false }).limit(50)
      },
      {
        name: 'Get bills by multiple criteria',
        query: () => supabase.from('bills').select('*').eq('payment_status', 'paid').eq('status', 'active').gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).limit(100)
      }
    ];
    
    for (const test of complexTests) {
      const result = await measureQueryTime(test.name, test.query);
      if (result.success) {
        console.log(`✅ ${test.name}: ${result.recordCount.toLocaleString()} records in ${result.duration.toFixed(3)}s`);
      }
    }
    
    // Test 4: Pagination performance
    console.log('\n📄 Test 4: Pagination Performance');
    console.log('=' .repeat(40));
    
    const paginationTests = [
      {
        name: 'Page 1 (10 records)',
        query: () => supabase.from('bills').select('*').range(0, 9)
      },
      {
        name: 'Page 10 (10 records)',
        query: () => supabase.from('bills').select('*').range(90, 99)
      },
      {
        name: 'Page 100 (10 records)',
        query: () => supabase.from('bills').select('*').range(990, 999)
      }
    ];
    
    for (const test of paginationTests) {
      const result = await measureQueryTime(test.name, test.query);
      if (result.success) {
        console.log(`✅ ${test.name}: ${result.recordCount.toLocaleString()} records in ${result.duration.toFixed(3)}s`);
      }
    }
    
    // Test 5: Search performance
    console.log('\n🔎 Test 5: Search Performance');
    console.log('=' .repeat(40));
    
    const searchTests = [
      {
        name: 'Search bills by bill number',
        query: () => supabase.from('bills').select('*').ilike('bill_number', '%BILL%').limit(50)
      },
      {
        name: 'Search bills by customer name',
        query: () => supabase.from('bills').select('*').ilike('customer_name', '%Customer%').limit(50)
      }
    ];
    
    for (const test of searchTests) {
      const result = await measureQueryTime(test.name, test.query);
      if (result.success) {
        console.log(`✅ ${test.name}: ${result.recordCount.toLocaleString()} records in ${result.duration.toFixed(3)}s`);
      }
    }
    
    console.log('\n🎉 Query Performance Test Completed!');
    console.log('\n💡 Performance Insights:');
    console.log('   - Query times under 100ms are excellent');
    console.log('   - Query times 100-500ms are good');
    console.log('   - Query times over 500ms may need optimization');
    console.log('   - Consider adding indexes for slow queries');
    
  } catch (error) {
    console.error('❌ Error during query performance test:', error);
  }
};

// Run the test
runQueryPerformanceTest();
