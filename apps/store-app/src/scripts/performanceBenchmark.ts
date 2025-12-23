// Phase 6: Performance Benchmarking
// Measures performance improvements from the accounting foundation migration

import { getDB } from '../lib/db';

interface BenchmarkResult {
  operation: string;
  beforeTime: number;
  afterTime: number;
  improvement: number;
  improvementPercent: number;
}

/**
 * Performance Benchmark Suite
 * Compares legacy vs new accounting foundation performance
 */
export async function runPerformanceBenchmark(): Promise<void> {
  console.log('⚡ Phase 6: Performance Benchmarking');
  console.log('=' .repeat(50));
  
  const testStoreId = 'perf-test-store';
  const results: BenchmarkResult[] = [];
  
  try {
    // Setup test data
    await setupPerformanceTestData(testStoreId);
    
    // Benchmark 1: Entity Queries
    console.log('📊 Benchmarking Entity Queries...');
    const entityResult = await benchmarkEntityQueries(testStoreId);
    results.push(entityResult);
    
    // Benchmark 2: Balance Calculations
    console.log('📊 Benchmarking Balance Calculations...');
    const balanceResult = await benchmarkBalanceCalculations(testStoreId);
    results.push(balanceResult);
    
    // Benchmark 3: Report Generation
    console.log('📊 Benchmarking Report Generation...');
    const reportResult = await benchmarkReportGeneration(testStoreId);
    results.push(reportResult);
    
    // Benchmark 4: Historical Queries
    console.log('📊 Benchmarking Historical Queries...');
    const historicalResult = await benchmarkHistoricalQueries(testStoreId);
    results.push(historicalResult);
    
    // Generate performance report
    generatePerformanceReport(results);
    
    // Cleanup
    await cleanupPerformanceTestData(testStoreId);
    
  } catch (error) {
    console.error('❌ Performance benchmarking failed:', error);
    await cleanupPerformanceTestData(testStoreId);
  }
}

async function setupPerformanceTestData(storeId: string): Promise<void> {
  console.log('🔧 Setting up performance test data...');
  
  // Create test entities
  const entities = [];
  for (let i = 0; i < 100; i++) {
    entities.push({
      id: `perf-entity-${i}`,
      store_id: storeId,
      branch_id: null,
      entity_type: i % 2 === 0 ? 'customer' : 'supplier',
      entity_code: `PERF-${i}`,
      name: `Performance Test Entity ${i}`,
      phone: `+123456789${i}`,
      lb_balance: Math.random() * 10000,
      usd_balance: Math.random() * 5000,
      is_system_entity: false,
      is_active: true,
      customer_data: i % 2 === 0 ? { lb_max_balance: 10000 } : null,
      supplier_data: i % 2 === 1 ? { supplier_type: 'wholesale' } : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    });
  }
  
  await getDB().entities.bulkAdd(entities as any);
  
  // Create test journal entries
  const journalEntries = [];
  const today = new Date().toISOString().split('T')[0];
  
  for (let i = 0; i < 200; i++) {
    const transactionId = `perf-txn-${i}`;
    const entityId = `perf-entity-${i % 100}`;
    const amount = Math.random() * 1000;
    
    // Debit entry
    journalEntries.push({
      id: `perf-debit-${i}`,
      store_id: storeId,
      branch_id: null,
      transaction_id: transactionId,
      account_code: '1200',
      entity_id: entityId,
      debit_amount: amount,
      credit_amount: 0,
      currency: 'USD',
      posted_date: today,
      fiscal_period: '2025-11',
      description: `Performance test transaction ${i}`,
      is_posted: true,
      created_at: new Date().toISOString(),
      created_by: 'perf-test',
      _synced: false
    });
    
    // Credit entry
    journalEntries.push({
      id: `perf-credit-${i}`,
      store_id: storeId,
      branch_id: null,
      transaction_id: transactionId,
      account_code: '4100',
      entity_id: entityId,
      debit_amount: 0,
      credit_amount: amount,
      currency: 'USD',
      posted_date: today,
      fiscal_period: '2025-11',
      description: `Performance test transaction ${i}`,
      is_posted: true,
      created_at: new Date().toISOString(),
      created_by: 'perf-test',
      _synced: false
    });
  }
  
  await getDB().journal_entries.bulkAdd(journalEntries as any);
  
  // Create test snapshots
  const snapshots = [];
  for (let i = 0; i < 100; i++) {
    snapshots.push({
      id: `perf-snapshot-${i}`,
      store_id: storeId,
      branch_id: null,
      account_code: '1200',
      entity_id: `perf-entity-${i}`,
      snapshot_date: today,
      snapshot_type: 'daily',
      balance_usd: Math.random() * 5000,
      balance_lbp: Math.random() * 10000,
      verified: true,
      created_at: new Date().toISOString(),
      _synced: false
    });
  }
  
  await getDB().balance_snapshots.bulkAdd(snapshots as any);
  
  console.log('✅ Performance test data created');
}

async function benchmarkEntityQueries(storeId: string): Promise<BenchmarkResult> {
  // Simulate legacy approach (direct table scan)
  const legacyStart = performance.now();
  const legacyCustomers = await getDB().entities
    .where('store_id')
    .equals(storeId)
    .filter((entity: any) => entity.entity_type === 'customer' && entity.is_active)
    .toArray();
  const legacyTime = performance.now() - legacyStart;
  
  // Simulate new approach (optimized query with indexing)
  const newStart = performance.now();
  const newCustomers = await getDB().entities
    .where('[store_id+entity_type]')
    .equals([storeId, 'customer'])
    .filter((entity: any) => entity.is_active)
    .toArray();
  const newTime = performance.now() - newStart;
  
  const improvement = legacyTime - newTime;
  const improvementPercent = ((improvement / legacyTime) * 100);
  
  return {
    operation: 'Entity Queries',
    beforeTime: legacyTime,
    afterTime: newTime,
    improvement,
    improvementPercent
  };
}

async function benchmarkBalanceCalculations(storeId: string): Promise<BenchmarkResult> {
  const entityId = 'perf-entity-0';
  
  // Legacy approach: Calculate from all journal entries
  const legacyStart = performance.now();
  const allEntries = await getDB().journal_entries
    .where('entity_id')
    .equals(entityId)
    .toArray();
  
  let legacyBalance = 0;
  allEntries.forEach((entry: any) => {
    if (entry.account_code === '1200') { // AR account
      legacyBalance += entry.debit_amount - entry.credit_amount;
    }
  });
  const legacyTime = performance.now() - legacyStart;
  
  // New approach: Use snapshot
  const newStart = performance.now();
  const today = new Date().toISOString().split('T')[0];
  const snapshot = await getDB().balance_snapshots
    .where('[entity_id+account_code+snapshot_date]')
    .equals([entityId, '1200', today])
    .first();
  
  const newBalance = snapshot ? snapshot.balance_usd : 0;
  const newTime = performance.now() - newStart;
  
  const improvement = legacyTime - newTime;
  const improvementPercent = ((improvement / legacyTime) * 100);
  
  return {
    operation: 'Balance Calculations',
    beforeTime: legacyTime,
    afterTime: newTime,
    improvement,
    improvementPercent
  };
}

async function benchmarkReportGeneration(storeId: string): Promise<BenchmarkResult> {
  const today = new Date().toISOString().split('T')[0];
  
  // Legacy approach: Calculate trial balance from journal entries
  const legacyStart = performance.now();
  const allJournalEntries = await getDB().journal_entries
    .where('store_id')
    .equals(storeId)
    .toArray();
  
  const accountBalances: { [key: string]: number } = {};
  allJournalEntries.forEach((entry: any) => {
    if (!accountBalances[entry.account_code]) {
      accountBalances[entry.account_code] = 0;
    }
    accountBalances[entry.account_code] += entry.debit_amount - entry.credit_amount;
  });
  const legacyTime = performance.now() - legacyStart;
  
  // New approach: Use snapshots for trial balance
  const newStart = performance.now();
  const snapshots = await getDB().balance_snapshots
    .where('[store_id+snapshot_date]')
    .equals([storeId, today])
    .toArray();
  
  const snapshotBalances: { [key: string]: number } = {};
  snapshots.forEach((snapshot: any) => {
    if (!snapshotBalances[snapshot.account_code]) {
      snapshotBalances[snapshot.account_code] = 0;
    }
    snapshotBalances[snapshot.account_code] += snapshot.balance_usd;
  });
  const newTime = performance.now() - newStart;
  
  const improvement = legacyTime - newTime;
  const improvementPercent = ((improvement / legacyTime) * 100);
  
  return {
    operation: 'Report Generation',
    beforeTime: legacyTime,
    afterTime: newTime,
    improvement,
    improvementPercent
  };
}

async function benchmarkHistoricalQueries(storeId: string): Promise<BenchmarkResult> {
  const entityId = 'perf-entity-0';
  const targetDate = new Date().toISOString().split('T')[0];
  
  // Legacy approach: Calculate historical balance from journal entries
  const legacyStart = performance.now();
  const historicalEntries = await getDB().journal_entries
    .where('entity_id')
    .equals(entityId)
    .filter((entry: any) => entry.posted_date <= targetDate)
    .toArray();
  
  let historicalBalance = 0;
  historicalEntries.forEach((entry: any) => {
    if (entry.account_code === '1200') {
      historicalBalance += entry.debit_amount - entry.credit_amount;
    }
  });
  const legacyTime = performance.now() - legacyStart;
  
  // New approach: Direct snapshot lookup
  const newStart = performance.now();
  const historicalSnapshot = await getDB().balance_snapshots
    .where('[entity_id+account_code+snapshot_date]')
    .equals([entityId, '1200', targetDate])
    .first();
  
  const snapshotBalance = historicalSnapshot ? historicalSnapshot.balance_usd : 0;
  const newTime = performance.now() - newStart;
  
  const improvement = legacyTime - newTime;
  const improvementPercent = ((improvement / legacyTime) * 100);
  
  return {
    operation: 'Historical Queries',
    beforeTime: legacyTime,
    afterTime: newTime,
    improvement,
    improvementPercent
  };
}

function generatePerformanceReport(results: BenchmarkResult[]): void {
  console.log('\n' + '=' .repeat(60));
  console.log('⚡ PERFORMANCE BENCHMARK RESULTS');
  console.log('=' .repeat(60));
  
  results.forEach(result => {
    console.log(`\n📊 ${result.operation}:`);
    console.log(`   Before: ${result.beforeTime.toFixed(2)}ms`);
    console.log(`   After:  ${result.afterTime.toFixed(2)}ms`);
    console.log(`   Improvement: ${result.improvement.toFixed(2)}ms (${result.improvementPercent.toFixed(1)}%)`);
    
    if (result.improvementPercent > 50) {
      console.log('   🚀 SIGNIFICANT IMPROVEMENT');
    } else if (result.improvementPercent > 0) {
      console.log('   ✅ IMPROVED');
    } else {
      console.log('   ⚠️ NO IMPROVEMENT');
    }
  });
  
  const avgImprovement = results.reduce((sum, r) => sum + r.improvementPercent, 0) / results.length;
  
  console.log('\n' + '-' .repeat(60));
  console.log(`📈 AVERAGE PERFORMANCE IMPROVEMENT: ${avgImprovement.toFixed(1)}%`);
  
  if (avgImprovement > 50) {
    console.log('🎉 EXCELLENT PERFORMANCE GAINS!');
  } else if (avgImprovement > 20) {
    console.log('✅ GOOD PERFORMANCE IMPROVEMENTS');
  } else if (avgImprovement > 0) {
    console.log('👍 MODEST PERFORMANCE IMPROVEMENTS');
  } else {
    console.log('⚠️ PERFORMANCE NEEDS ATTENTION');
  }
  
  console.log('=' .repeat(60));
}

async function cleanupPerformanceTestData(storeId: string): Promise<void> {
  await getDB().transaction('rw', [getDB().entities, getDB().journal_entries, getDB().balance_snapshots], async () => {
    await getDB().entities.where('store_id').equals(storeId).delete();
    await getDB().journal_entries.where('store_id').equals(storeId).delete();
    await getDB().balance_snapshots.where('store_id').equals(storeId).delete();
  });
  
  console.log('🧹 Performance test data cleaned up');
}

// Export for manual execution
export const performanceBenchmark = {
  runPerformanceBenchmark
};
