#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const BATCH_SIZE = 100;
const TOTAL_RECORDS = 10000;

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;
const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];

// Generate test bills data
const generateTestBills = (count) => {
  const data = [];
  const paymentMethods = ['cash', 'card', 'credit'];
  const paymentStatuses = ['paid', 'partial', 'pending'];
  const statuses = ['active', 'cancelled', 'refunded'];
  
  for (let i = 0; i < count; i++) {
    const subtotal = randomFloat(10, 1000);
    const total = subtotal + randomFloat(0, 100);
    const amountPaid = Math.random() > 0.3 ? total : randomFloat(0, subtotal);
    const amountDue = total - amountPaid;
    
    data.push({
      id: uuidv4(),
      store_id: '00000000-0000-0000-0000-000000000001', // Placeholder store ID
      bill_number: `PERF-TEST-${randomInt(100000, 999999)}-${i + 1}`,
      customer_id: null, // We'll skip customer for now
      customer_name: `Performance Test Customer ${i + 1}`,
      subtotal: subtotal,
      total_amount: total,
      payment_method: randomChoice(paymentMethods),
      payment_status: amountDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'pending',
      amount_paid: amountPaid,
      amount_due: amountDue,
      bill_date: new Date().toISOString(),
      notes: `Performance test bill ${i + 1}`,
      status: randomChoice(statuses),
      created_by: '00000000-0000-0000-0000-000000000001', // Placeholder user ID
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return data;
};

const runPerformanceTest = async () => {
  console.log('🚀 Starting Database Performance Test...');
  console.log(`📊 Target: ${TOTAL_RECORDS.toLocaleString()} test bills`);
  console.log(`📦 Batch size: ${BATCH_SIZE.toLocaleString()} records per batch`);
  
  try {
    // First, let's check if we can connect to the database
    console.log('\n🔌 Testing database connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('bills')
      .select('id')
      .limit(1);
    
    if (connectionError) {
      console.error('❌ Database connection failed:', connectionError);
      console.log('\n💡 This might be due to:');
      console.log('   - Missing or incorrect environment variables');
      console.log('   - Database not accessible');
      console.log('   - RLS policies blocking access');
      return;
    }
    
    console.log('✅ Database connection successful!');
    
    // Generate test data
    console.log('\n📋 Generating test bills data...');
    const testData = generateTestBills(TOTAL_RECORDS);
    console.log(`✅ Generated ${testData.length.toLocaleString()} test bills`);
    
    // Test insertion performance
    console.log('\n💾 Testing insertion performance...');
    const startTime = Date.now();
    
    const batches = Math.ceil(testData.length / BATCH_SIZE);
    let successfulInserts = 0;
    
    for (let i = 0; i < batches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, testData.length);
      const batchData = testData.slice(batchStart, batchEnd);
      
      const batchStartTime = Date.now();
      const { error } = await supabase.from('bills').insert(batchData);
      const batchEndTime = Date.now();
      
      if (error) {
        console.error(`❌ Batch ${i + 1} error:`, error.message);
        continue;
      }
      
      successfulInserts += batchData.length;
      const batchDuration = (batchEndTime - batchStartTime) / 1000;
      const batchRate = batchData.length / batchDuration;
      
      const progress = ((i + 1) / batches * 100).toFixed(1);
      console.log(`📈 Batch ${i + 1}/${batches} (${progress}%): ${batchData.length} bills in ${batchDuration.toFixed(2)}s (${batchRate.toFixed(0)} bills/s)`);
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const rate = successfulInserts / duration;
    
    console.log(`\n🎉 Performance test completed!`);
    console.log(`📊 Successfully inserted: ${successfulInserts.toLocaleString()}/${TOTAL_RECORDS.toLocaleString()} bills`);
    console.log(`⏱️  Total time: ${duration.toFixed(2)} seconds`);
    console.log(`🚀 Average rate: ${rate.toFixed(0)} bills/second`);
    
    if (successfulInserts < TOTAL_RECORDS) {
      console.log(`\n⚠️  Some inserts failed. This might be due to:`);
      console.log(`   - RLS policies blocking inserts`);
      console.log(`   - Missing required foreign key references`);
      console.log(`   - Database constraints`);
    }
    
  } catch (error) {
    console.error('❌ Error during performance test:', error);
  }
};

runPerformanceTest();
