#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// SQL commands to add performance indexes
const indexCommands = [
  {
    name: 'Composite index for bills (store_id, created_at)',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_store_created ON bills(store_id, created_at DESC)'
  },
  {
    name: 'Payment status index',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_payment_status ON bills(payment_status)'
  },
  {
    name: 'Bill number search index',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number)'
  },
  {
    name: 'Customer lookup index',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id)'
  },
  {
    name: 'Status index for active bills',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status)'
  },
  {
    name: 'Total amount index for financial queries',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_total_amount ON bills(total_amount)'
  },
  {
    name: 'Bill date index for date-based queries',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date)'
  },
  {
    name: 'Composite index for complex filtering',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bills_complex_filter ON bills(store_id, status, payment_status, created_at DESC)'
  },
  {
    name: 'Audit logs timeline index',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_timeline ON bill_audit_logs(bill_id, created_at DESC)'
  },
  {
    name: 'Bill line items index',
    sql: 'CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill ON bill_line_items(bill_id, line_order)'
  }
];

const applyIndexes = async () => {
  console.log('🚀 Applying Database Performance Indexes...');
  console.log('=' .repeat(50));
  
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
    
    // Apply each index
    console.log('\n📊 Applying performance indexes...');
    const results = [];
    
    for (const index of indexCommands) {
      console.log(`\n🔧 Creating index: ${index.name}`);
      
      try {
        const startTime = Date.now();
        const { error } = await supabase.rpc('exec_sql', { sql: index.sql });
        const duration = (Date.now() - startTime) / 1000;
        
        if (error) {
          console.log(`  ❌ Failed: ${error.message}`);
          results.push({
            name: index.name,
            success: false,
            error: error.message,
            duration
          });
        } else {
          console.log(`  ✅ Success: Created in ${duration.toFixed(3)}s`);
          results.push({
            name: index.name,
            success: true,
            error: null,
            duration
          });
        }
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
        results.push({
          name: index.name,
          success: false,
          error: err.message,
          duration: 0
        });
      }
      
      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Summary
    console.log('\n📋 Index Creation Summary');
    console.log('=' .repeat(30));
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Successfully created: ${successful} indexes`);
    console.log(`❌ Failed to create: ${failed} indexes`);
    
    if (successful > 0) {
      console.log('\n🎉 Performance indexes have been added!');
      console.log('💡 You should see improved query performance for:');
      console.log('   - Store-specific bill queries');
      console.log('   - Payment status filtering');
      console.log('   - Bill number searches');
      console.log('   - Customer-related queries');
      console.log('   - Date range queries');
      console.log('   - Complex filtering operations');
    }
    
    if (failed > 0) {
      console.log('\n⚠️  Some indexes failed to create. This might be due to:');
      console.log('   - Indexes already exist');
      console.log('   - Insufficient permissions');
      console.log('   - Database constraints');
      console.log('\n💡 You can manually run the SQL commands in your Supabase dashboard');
    }
    
    // Save results to file
    const resultsFile = 'index-creation-results.json';
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n📄 Results saved to: ${resultsFile}`);
    
  } catch (error) {
    console.error('❌ Error applying indexes:', error);
  }
};

// Run the index creation
applyIndexes();

