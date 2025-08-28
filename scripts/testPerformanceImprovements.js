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

// Performance test queries
const performanceTests = [
  {
    name: 'Simple SELECT (1 record)',
    query: () => supabase.from('bills').select('*').limit(1),
    description: 'Basic record retrieval'
  },
  {
    name: 'COUNT query',
    query: () => supabase.from('bills').select('*', { count: 'exact', head: true }),
    description: 'Counting total records'
  },
  {
    name: 'ORDER BY query (created_at)',
    query: () => supabase.from('bills').select('*').order('created_at', { ascending: false }).limit(10),
    description: 'Sorting by creation date (should be improved by index)'
  },
  {
    name: 'WHERE clause (status)',
    query: () => supabase.from('bills').select('*').eq('status', 'active').limit(10),
    description: 'Filtering by status (should be improved by index)'
  },
  {
    name: 'WHERE clause (payment_status)',
    query: () => supabase.from('bills').select('*').eq('payment_status', 'paid').limit(10),
    description: 'Filtering by payment status (should be improved by index)'
  },
  {
    name: 'Complex query (multiple filters)',
    query: () => supabase.from('bills').select('*').eq('status', 'active').gte('total_amount', 100).limit(10),
    description: 'Multiple WHERE conditions (should be improved by composite index)'
  },
  {
    name: 'Store-specific bills',
    query: () => supabase.from('bills').select('*').eq('store_id', '00000000-0000-0000-0000-000000000001').limit(10),
    description: 'Filtering by store (should be improved by composite index)'
  },
  {
    name: 'Date range query',
    query: () => supabase.from('bills').select('*').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(10),
    description: 'Date range filtering (should be improved by date index)'
  },
  {
    name: 'Bill number search',
    query: () => supabase.from('bills').select('*').ilike('bill_number', '%BILL%').limit(10),
    description: 'Text search (should be improved by bill_number index)'
  },
  {
    name: 'Customer lookup',
    query: () => supabase.from('bills').select('*').not('customer_id', 'is', null).limit(10),
    description: 'Customer-related queries (should be improved by customer_id index)'
  }
];

// Run performance tests
const runPerformanceTests = async () => {
  console.log('🚀 Testing Performance Improvements After Index Implementation...');
  console.log('=' .repeat(70));
  
  try {
    // Test database connection
    console.log('\n🔌 Testing database connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('bills')
      .select('id')
      .limit(1);
    
    if (connectionError) {
      console.error('❌ Database connection failed:', connectionError.message);
      return;
    }
    
    console.log('✅ Database connection successful!');
    
    // Run performance tests
    console.log('\n📊 Running Performance Tests...');
    console.log('=' .repeat(50));
    
    const results = [];
    
    for (const test of performanceTests) {
      console.log(`\n🔍 Testing: ${test.name}`);
      console.log(`   Description: ${test.description}`);
      
      // Run test multiple times for more accurate results
      const testRuns = 3;
      const runTimes = [];
      
      for (let i = 0; i < testRuns; i++) {
        const startTime = Date.now();
        const { data, error, count } = await test.query();
        const endTime = Date.now();
        
        if (error) {
          console.log(`   ❌ Run ${i + 1} failed: ${error.message}`);
          break;
        }
        
        const duration = (endTime - startTime) / 1000;
        runTimes.push(duration);
        
        const recordCount = count || (data ? data.length : 0);
        console.log(`   ✅ Run ${i + 1}: ${duration.toFixed(3)}s (${recordCount} records)`);
      }
      
      if (runTimes.length > 0) {
        const avgTime = runTimes.reduce((sum, time) => sum + time, 0) / runTimes.length;
        const minTime = Math.min(...runTimes);
        const maxTime = Math.max(...runTimes);
        
        results.push({
          name: test.name,
          description: test.description,
          avgTime,
          minTime,
          maxTime,
          recordCount: count || (data ? data.length : 0)
        });
        
        console.log(`   📊 Average: ${avgTime.toFixed(3)}s (Min: ${minTime.toFixed(3)}s, Max: ${maxTime.toFixed(3)}s)`);
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Performance analysis
    console.log('\n📈 Performance Analysis');
    console.log('=' .repeat(30));
    
    const performanceCategories = {
      excellent: results.filter(r => r.avgTime < 0.1),
      good: results.filter(r => r.avgTime >= 0.1 && r.avgTime < 0.5),
      fair: results.filter(r => r.avgTime >= 0.5 && r.avgTime < 1.0),
      poor: results.filter(r => r.avgTime >= 1.0)
    };
    
    console.log(`🚀 Excellent (< 100ms): ${performanceCategories.excellent.length} queries`);
    console.log(`✅ Good (100-500ms): ${performanceCategories.good.length} queries`);
    console.log(`⚠️  Fair (500ms-1s): ${performanceCategories.fair.length} queries`);
    console.log(`❌ Poor (> 1s): ${performanceCategories.poor.length} queries`);
    
    // Detailed results
    console.log('\n📋 Detailed Test Results');
    console.log('=' .repeat(50));
    
    results.forEach((result, index) => {
      const performance = result.avgTime < 0.1 ? '🚀 Excellent' : 
                         result.avgTime < 0.5 ? '✅ Good' : 
                         result.avgTime < 1.0 ? '⚠️  Fair' : '❌ Poor';
      
      console.log(`${index + 1}. ${performance} ${result.name}`);
      console.log(`   ${result.description}`);
      console.log(`   Average: ${result.avgTime.toFixed(3)}s (${result.minTime.toFixed(3)}s - ${result.maxTime.toFixed(3)}s)`);
      console.log(`   Records: ${result.recordCount}`);
      console.log('');
    });
    
    // Improvement recommendations
    console.log('\n💡 Performance Improvement Recommendations');
    console.log('=' .repeat(45));
    
    const slowQueries = results.filter(r => r.avgTime >= 0.5);
    
    if (slowQueries.length === 0) {
      console.log('🎉 All queries are performing excellently!');
      console.log('   Your database is well-optimized with the new indexes.');
    } else {
      console.log(`⚠️  ${slowQueries.length} queries could benefit from further optimization:`);
      
      slowQueries.forEach(query => {
        console.log(`\n   🔍 ${query.name}:`);
        console.log(`      Current: ${query.avgTime.toFixed(3)}s average`);
        
        if (query.name.includes('ORDER BY')) {
          console.log(`      💡 Consider: Composite index on (store_id, created_at DESC)`);
        }
        if (query.name.includes('Complex query')) {
          console.log(`      💡 Consider: Composite index on (store_id, status, payment_status)`);
        }
        if (query.name.includes('Date range')) {
          console.log(`      💡 Consider: Index on created_at column`);
        }
        if (query.name.includes('Text search')) {
          console.log(`      💡 Consider: Full-text search index on bill_number`);
        }
      });
    }
    
    // Cache recommendations
    console.log('\n🗄️  Caching Recommendations');
    console.log('=' .repeat(30));
    
    const frequentlyAccessed = results.filter(r => r.name.includes('Simple SELECT') || r.name.includes('COUNT'));
    const moderatelyAccessed = results.filter(r => r.name.includes('WHERE clause') || r.name.includes('Complex query'));
    
    console.log('📦 High Priority Cache (TTL: 1-2 minutes):');
    frequentlyAccessed.forEach(query => {
      console.log(`   - ${query.name}: ${query.description}`);
    });
    
    console.log('\n📦 Medium Priority Cache (TTL: 5-10 minutes):');
    moderatelyAccessed.forEach(query => {
      console.log(`   - ${query.name}: ${query.description}`);
    });
    
    // Save results
    const resultsFile = 'performance-test-results.json';
    const fs = await import('fs');
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed results saved to: ${resultsFile}`);
    
    console.log('\n🎉 Performance testing completed!');
    
  } catch (error) {
    console.error('❌ Error during performance testing:', error);
  }
};

// Run the performance tests
runPerformanceTests();

