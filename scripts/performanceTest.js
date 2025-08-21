#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const BATCH_SIZE = 100;
const TOTAL_RECORDS = 10000;

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Utility functions
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;
const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];

// Generate test data
const generateTestData = (count) => {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      id: uuidv4(),
      name: `Test Item ${i + 1}`,
      value: randomFloat(1, 1000),
      category: randomChoice(['A', 'B', 'C']),
      created_at: new Date().toISOString()
    });
  }
  return data;
};

// Performance test
const runPerformanceTest = async () => {
  console.log('🚀 Starting Database Performance Test...');
  
  try {
    const testData = generateTestData(TOTAL_RECORDS);
    console.log(`📊 Generated ${testData.length.toLocaleString()} test records`);
    
    // Test insertion performance
    console.log('\n💾 Testing insertion performance...');
    const startTime = Date.now();
    
    const batches = Math.ceil(testData.length / BATCH_SIZE);
    for (let i = 0; i < batches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, testData.length);
      const batchData = testData.slice(batchStart, batchEnd);
      
      const { error } = await supabase.from('test_performance').insert(batchData);
      if (error) {
        console.error(`❌ Batch ${i + 1} error:`, error);
        continue;
      }
      
      const progress = ((i + 1) / batches * 100).toFixed(1);
      console.log(`📈 Progress: ${progress}% (${batchEnd.toLocaleString()}/${testData.length.toLocaleString()})`);
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const rate = TOTAL_RECORDS / duration;
    
    console.log(`\n🎉 Performance test completed!`);
    console.log(`⏱️  Total time: ${duration.toFixed(2)} seconds`);
    console.log(`🚀 Rate: ${rate.toFixed(0)} records/second`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

runPerformanceTest();
