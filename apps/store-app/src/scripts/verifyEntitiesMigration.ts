/**
 * Verification script to ensure all data is properly migrated from legacy tables to entities table
 * 
 * Usage:
 *   import { verifyEntitiesMigration } from './scripts/verifyEntitiesMigration';
 *   const report = await verifyEntitiesMigration(storeId);
 *   console.log(report);
 */

import { db } from '../lib/db';

export interface VerificationReport {
  customers: {
    total: number;
    migrated: number;
    missing: string[];
    issues: Array<{
      id: string;
      name: string;
      issue: string;
    }>;
  };
  suppliers: {
    total: number;
    migrated: number;
    missing: string[];
    issues: Array<{
      id: string;
      name: string;
      issue: string;
    }>;
  };
  employees: {
    total: number;
    migrated: number;
    missing: string[];
    issues: Array<{
      id: string;
      name: string;
      issue: string;
    }>;
  };
  foreignKeys: {
    valid: number;
    invalid: number;
    issues: Array<{
      table: string;
      recordId: string;
      fkField: string;
      fkValue: string;
      issue: string;
    }>;
  };
  summary: {
    allMigrated: boolean;
    totalEntities: number;
    totalLegacy: number;
    discrepancies: number;
  };
}

/**
 * Verify that all customers, suppliers, and employees are properly migrated to entities table
 */
export async function verifyEntitiesMigration(storeId: string): Promise<VerificationReport> {
  const report: VerificationReport = {
    customers: { total: 0, migrated: 0, missing: [], issues: [] },
    suppliers: { total: 0, migrated: 0, missing: [], issues: [] },
    employees: { total: 0, migrated: 0, missing: [], issues: [] },
    foreignKeys: { valid: 0, invalid: 0, issues: [] },
    summary: {
      allMigrated: false,
      totalEntities: 0,
      totalLegacy: 0,
      discrepancies: 0
    }
  };

  console.log(`🔍 Starting verification for store: ${storeId}`);

  try {
    // Verify customers
    console.log('📊 Verifying customers...');
    const customers = await db.customers
      .where('store_id')
      .equals(storeId)
      .filter(c => !c._deleted)
      .toArray();
    
    report.customers.total = customers.length;
    console.log(`   Found ${customers.length} customers in legacy table`);

    for (const customer of customers) {
      const entity = await db.entities.get(customer.id);
      
      if (!entity) {
        report.customers.missing.push(customer.id);
        report.customers.issues.push({
          id: customer.id,
          name: customer.name,
          issue: 'Entity not found in entities table'
        });
        continue;
      }

      if (entity.entity_type !== 'customer') {
        report.customers.issues.push({
          id: customer.id,
          name: customer.name,
          issue: `Wrong entity type: expected 'customer', got '${entity.entity_type}'`
        });
        continue;
      }

      // Verify balance consistency
      const balanceMismatch = 
        Math.abs((customer.usd_balance || 0) - (entity.usd_balance || 0)) > 0.01 ||
        Math.abs((customer.lb_balance || 0) - (entity.lb_balance || 0)) > 0.01;

      if (balanceMismatch) {
        report.customers.issues.push({
          id: customer.id,
          name: customer.name,
          issue: `Balance mismatch: legacy (USD: ${customer.usd_balance}, LBP: ${customer.lb_balance}) vs entity (USD: ${entity.usd_balance}, LBP: ${entity.lb_balance})`
        });
        continue;
      }

      report.customers.migrated++;
    }

    // Verify suppliers
    console.log('📊 Verifying suppliers...');
    const suppliers = await db.suppliers
      .where('store_id')
      .equals(storeId)
      .filter(s => !s._deleted)
      .toArray();
    
    report.suppliers.total = suppliers.length;
    console.log(`   Found ${suppliers.length} suppliers in legacy table`);

    for (const supplier of suppliers) {
      const entity = await db.entities.get(supplier.id);
      
      if (!entity) {
        report.suppliers.missing.push(supplier.id);
        report.suppliers.issues.push({
          id: supplier.id,
          name: supplier.name,
          issue: 'Entity not found in entities table'
        });
        continue;
      }

      if (entity.entity_type !== 'supplier') {
        report.suppliers.issues.push({
          id: supplier.id,
          name: supplier.name,
          issue: `Wrong entity type: expected 'supplier', got '${entity.entity_type}'`
        });
        continue;
      }

      // Verify balance consistency
      const balanceMismatch = 
        Math.abs((supplier.usd_balance || 0) - (entity.usd_balance || 0)) > 0.01 ||
        Math.abs((supplier.lb_balance || 0) - (entity.lb_balance || 0)) > 0.01;

      if (balanceMismatch) {
        report.suppliers.issues.push({
          id: supplier.id,
          name: supplier.name,
          issue: `Balance mismatch: legacy (USD: ${supplier.usd_balance}, LBP: ${supplier.lb_balance}) vs entity (USD: ${entity.usd_balance}, LBP: ${entity.lb_balance})`
        });
        continue;
      }

      report.suppliers.migrated++;
    }

    // Verify employees
    console.log('📊 Verifying employees...');
    const employees = await db.users
      .where('store_id')
      .equals(storeId)
      .filter(e => !e._deleted)
      .toArray();
    
    report.employees.total = employees.length;
    console.log(`   Found ${employees.length} employees in legacy table`);

    for (const employee of employees) {
      const entity = await db.entities.get(employee.id);
      
      if (!entity) {
        report.employees.missing.push(employee.id);
        report.employees.issues.push({
          id: employee.id,
          name: employee.name || employee.email,
          issue: 'Entity not found in entities table'
        });
        continue;
      }

      if (entity.entity_type !== 'employee') {
        report.employees.issues.push({
          id: employee.id,
          name: employee.name || employee.email,
          issue: `Wrong entity type: expected 'employee', got '${entity.entity_type}'`
        });
        continue;
      }

      // Verify balance consistency (if employee has balances)
      const employeeUsdBalance = (employee as any).usd_balance || 0;
      const employeeLbpBalance = (employee as any).lbp_balance || 0;
      
      const balanceMismatch = 
        Math.abs(employeeUsdBalance - (entity.usd_balance || 0)) > 0.01 ||
        Math.abs(employeeLbpBalance - (entity.lb_balance || 0)) > 0.01;

      if (balanceMismatch) {
        report.employees.issues.push({
          id: employee.id,
          name: employee.name || employee.email,
          issue: `Balance mismatch: legacy (USD: ${employeeUsdBalance}, LBP: ${employeeLbpBalance}) vs entity (USD: ${entity.usd_balance}, LBP: ${entity.lb_balance})`
        });
        continue;
      }

      report.employees.migrated++;
    }

    // Verify foreign key references
    console.log('📊 Verifying foreign key references...');
    
    // Check bills.customer_id
    const bills = await db.bills
      .where('store_id')
      .equals(storeId)
      .filter(b => !b._deleted && b.customer_id)
      .toArray();
    
    for (const bill of bills) {
      if (bill.customer_id) {
        const entity = await db.entities.get(bill.customer_id);
        if (entity && entity.entity_type === 'customer') {
          report.foreignKeys.valid++;
        } else {
          report.foreignKeys.invalid++;
          report.foreignKeys.issues.push({
            table: 'bills',
            recordId: bill.id,
            fkField: 'customer_id',
            fkValue: bill.customer_id,
            issue: entity ? `Wrong entity type: ${entity.entity_type}` : 'Entity not found'
          });
        }
      }
    }

    // Check inventory_bills.supplier_id
    const inventoryBills = await db.inventory_bills
      .where('store_id')
      .equals(storeId)
      .filter(b => !b._deleted && b.supplier_id)
      .toArray();
    
    for (const bill of inventoryBills) {
      if (bill.supplier_id) {
        const entity = await db.entities.get(bill.supplier_id);
        if (entity && entity.entity_type === 'supplier') {
          report.foreignKeys.valid++;
        } else {
          report.foreignKeys.invalid++;
          report.foreignKeys.issues.push({
            table: 'inventory_bills',
            recordId: bill.id,
            fkField: 'supplier_id',
            fkValue: bill.supplier_id,
            issue: entity ? `Wrong entity type: ${entity.entity_type}` : 'Entity not found'
          });
        }
      }
    }

    // Check transactions.customer_id and transactions.supplier_id
    const transactions = await db.transactions
      .where('store_id')
      .equals(storeId)
      .filter(t => !t._deleted)
      .toArray();
    
    for (const transaction of transactions) {
      if ((transaction as any).customer_id) {
        const entity = await db.entities.get((transaction as any).customer_id);
        if (entity && entity.entity_type === 'customer') {
          report.foreignKeys.valid++;
        } else {
          report.foreignKeys.invalid++;
          report.foreignKeys.issues.push({
            table: 'transactions',
            recordId: transaction.id,
            fkField: 'customer_id',
            fkValue: (transaction as any).customer_id,
            issue: entity ? `Wrong entity type: ${entity.entity_type}` : 'Entity not found'
          });
        }
      }
      
      if ((transaction as any).supplier_id) {
        const entity = await db.entities.get((transaction as any).supplier_id);
        if (entity && entity.entity_type === 'supplier') {
          report.foreignKeys.valid++;
        } else {
          report.foreignKeys.invalid++;
          report.foreignKeys.issues.push({
            table: 'transactions',
            recordId: transaction.id,
            fkField: 'supplier_id',
            fkValue: (transaction as any).supplier_id,
            issue: entity ? `Wrong entity type: ${entity.entity_type}` : 'Entity not found'
          });
        }
      }
    }

    // Calculate summary
    const totalLegacy = report.customers.total + report.suppliers.total + report.employees.total;
    const totalMigrated = report.customers.migrated + report.suppliers.migrated + report.employees.migrated;
    const totalIssues = 
      report.customers.issues.length + 
      report.suppliers.issues.length + 
      report.employees.issues.length + 
      report.foreignKeys.issues.length;

    report.summary = {
      allMigrated: totalLegacy === totalMigrated && totalIssues === 0,
      totalEntities: totalMigrated,
      totalLegacy: totalLegacy,
      discrepancies: totalIssues
    };

    console.log('✅ Verification complete');
    console.log(`   Summary: ${totalMigrated}/${totalLegacy} entities migrated, ${totalIssues} issues found`);

    return report;

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  }
}

/**
 * Print verification report in a readable format
 */
export function printVerificationReport(report: VerificationReport): void {
  console.log('\n📋 VERIFICATION REPORT');
  console.log('='.repeat(50));
  
  console.log('\n📊 Customers:');
  console.log(`   Total: ${report.customers.total}`);
  console.log(`   Migrated: ${report.customers.migrated}`);
  console.log(`   Missing: ${report.customers.missing.length}`);
  if (report.customers.issues.length > 0) {
    console.log(`   Issues: ${report.customers.issues.length}`);
    report.customers.issues.forEach(issue => {
      console.log(`     - ${issue.name} (${issue.id}): ${issue.issue}`);
    });
  }

  console.log('\n📊 Suppliers:');
  console.log(`   Total: ${report.suppliers.total}`);
  console.log(`   Migrated: ${report.suppliers.migrated}`);
  console.log(`   Missing: ${report.suppliers.missing.length}`);
  if (report.suppliers.issues.length > 0) {
    console.log(`   Issues: ${report.suppliers.issues.length}`);
    report.suppliers.issues.forEach(issue => {
      console.log(`     - ${issue.name} (${issue.id}): ${issue.issue}`);
    });
  }

  console.log('\n📊 Employees:');
  console.log(`   Total: ${report.employees.total}`);
  console.log(`   Migrated: ${report.employees.migrated}`);
  console.log(`   Missing: ${report.employees.missing.length}`);
  if (report.employees.issues.length > 0) {
    console.log(`   Issues: ${report.employees.issues.length}`);
    report.employees.issues.forEach(issue => {
      console.log(`     - ${issue.name} (${issue.id}): ${issue.issue}`);
    });
  }

  console.log('\n🔗 Foreign Keys:');
  console.log(`   Valid: ${report.foreignKeys.valid}`);
  console.log(`   Invalid: ${report.foreignKeys.invalid}`);
  if (report.foreignKeys.issues.length > 0) {
    console.log(`   Issues: ${report.foreignKeys.issues.length}`);
    report.foreignKeys.issues.slice(0, 10).forEach(issue => {
      console.log(`     - ${issue.table}.${issue.fkField} (${issue.recordId}): ${issue.issue}`);
    });
    if (report.foreignKeys.issues.length > 10) {
      console.log(`     ... and ${report.foreignKeys.issues.length - 10} more issues`);
    }
  }

  console.log('\n📈 Summary:');
  console.log(`   All Migrated: ${report.summary.allMigrated ? '✅ YES' : '❌ NO'}`);
  console.log(`   Total Entities: ${report.summary.totalEntities}`);
  console.log(`   Total Legacy: ${report.summary.totalLegacy}`);
  console.log(`   Discrepancies: ${report.summary.discrepancies}`);
  console.log('='.repeat(50) + '\n');
}

