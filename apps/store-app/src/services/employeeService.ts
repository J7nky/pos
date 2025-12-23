import { getDB } from '../lib/db';
import { Employee } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

/**
 * EmployeeService - Following offline-first architecture pattern
 * Creates auth users in Supabase, then stores profile in IndexedDB for sync
 */
export class EmployeeService {
  /**
   * Get all employees for a store (excluding deleted ones)
   */
  static async getEmployees(storeId: string): Promise<Employee[]> {
    return await getDB().users
      .where('store_id')
      .equals(storeId)
      .filter(emp => !emp._deleted)
      .toArray();
  }

  /**
   * Get a single employee by ID
   */
  static async getEmployee(employeeId: string): Promise<Employee | undefined> {
    return await getDB().users.get(employeeId);
  }

  /**
   * Get employees by role for a store (for quota checking)
   */
  static async getEmployeesByRole(storeId: string, role: 'admin' | 'manager' | 'cashier'): Promise<Employee[]> {
    return await getDB().users
      .where('store_id')
      .equals(storeId)
      .filter(emp => emp.role === role && !emp._deleted)
      .toArray();
  }

  /**
   * Create a new employee with Supabase authentication
   * Creates auth user first, then stores profile in IndexedDB
   */
  static async createEmployeeWithAuth(
    storeId: string, 
    employeeData: Omit<Employee, 'id' | 'store_id' | 'created_at' | 'updated_at' | '_synced' | '_deleted'>,
    password: string
  ): Promise<Employee> {
    // Validate role limits
    const existingEmployees = await this.getEmployeesByRole(storeId, employeeData.role);
    const maxAllowed = employeeData.role === 'cashier' ? 2 : 1;
    
    if (existingEmployees.length >= maxAllowed) {
      throw new Error(`Cannot add more ${employeeData.role}s. Maximum allowed: ${maxAllowed}`);
    }

    // Check if email already exists
    const existingByEmail = await getDB().users
      .where('store_id')
      .equals(storeId)
      .filter(emp => emp.email === employeeData.email && !emp._deleted)
      .first();
    
    if (existingByEmail) {
      throw new Error('An employee with this email already exists');
    }

    // Store current session to check if it changes
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    let sessionChanged = false;
    
    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: employeeData.email,
      password: password,
      options: {
        data: {
          name: employeeData.name,
          role: employeeData.role,
          store_id: storeId
        }
      }
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create auth user: ${authError?.message || 'No user returned'}`);
    }

    // Check if signUp auto-logged in the new user
    const { data: { session: afterSignUpSession } } = await supabase.auth.getSession();
    if (afterSignUpSession && afterSignUpSession.user.id !== currentSession?.user?.id) {
      sessionChanged = true;
    }

    // Create employee record with auth user ID
    const now = new Date().toISOString();
    const employee: Employee = {
      id: authData.user.id, // Use auth user ID
      store_id: storeId,
      ...employeeData,
      created_at: now,
      updated_at: now,
      _synced: true, // Will be synced immediately
      _deleted: false
    };

    // Insert directly to Supabase users table (don't wait for sync)
    // Remove sync-specific fields before inserting
    const { _synced, _deleted, _lastSyncedAt, ...supabaseRecord } = employee;
    
    const { error: insertError } = await supabase
      .from('users')
      .insert(supabaseRecord as any);

    if (insertError) {
      // Rollback: delete the auth user if we can't create the profile
      console.error('Failed to create employee profile in Supabase:', insertError);
      throw new Error(`Failed to create employee profile: ${insertError.message}`);
    }

    // Store in IndexedDB first (already synced)
    await getDB().users.add(employee);

    // Restore admin session if it was changed (do this AFTER storing to avoid race conditions)
    if (sessionChanged && currentSession) {
      console.log('🔄 Restoring admin session after employee creation');
      
      // Use replaceState to avoid triggering full auth state change
      // This minimizes disruption to sync and other services
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: currentSession.access_token,
        refresh_token: currentSession.refresh_token
      });
      
      if (sessionError) {
        console.error('Failed to restore admin session:', sessionError);
        // Not critical - admin can refresh page if needed
      }
      
      // Small delay to let auth state stabilize before returning
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return employee;
  }

  /**
   * Create a new employee (legacy method - local only, no auth)
   * Validates role limits (max 2 cashiers, max 1 manager)
   * @deprecated Use createEmployeeWithAuth for employees who need system access
   */
  static async createEmployee(storeId: string, employeeData: Omit<Employee, 'id' | 'store_id' | 'created_at' | 'updated_at' | '_synced' | '_deleted'>): Promise<Employee> {
    // Validate role limits
    const existingEmployees = await this.getEmployeesByRole(storeId, employeeData.role);
    const maxAllowed = employeeData.role === 'cashier' ? 2 : 1;
    
    if (existingEmployees.length >= maxAllowed) {
      throw new Error(`Cannot add more ${employeeData.role}s. Maximum allowed: ${maxAllowed}`);
    }

    // Check if email already exists
    const existingByEmail = await getDB().users
      .where('store_id')
      .equals(storeId)
      .filter(emp => emp.email === employeeData.email && !emp._deleted)
      .first();
    
    if (existingByEmail) {
      throw new Error('An employee with this email already exists');
    }

    // Create employee record
    const now = new Date().toISOString();
    const employee: Employee = {
      id: uuidv4(),
      store_id: storeId,
      ...employeeData,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false
    };

    await getDB().users.add(employee);
    return employee;
  }

  /**
   * Update an existing employee
   */
  static async updateEmployee(employeeId: string, updates: Partial<Omit<Employee, 'id' | 'store_id' | 'created_at' | '_synced'>>): Promise<void> {
    const employee = await getDB().users.get(employeeId);
    if (!employee || employee._deleted) {
      throw new Error('Employee not found');
    }

    // If role is being changed, check new role limits
    if (updates.role && updates.role !== employee.role) {
      const existingEmployees = await this.getEmployeesByRole(employee.store_id, updates.role);
      const maxAllowed = updates.role === 'cashier' ? 2 : 1;
      
      if (existingEmployees.length >= maxAllowed) {
        throw new Error(`Cannot change role to ${updates.role}. Maximum allowed: ${maxAllowed}`);
      }
    }

    // If email is being changed, check uniqueness
    if (updates.email && updates.email !== employee.email) {
      const existingByEmail = await getDB().users
        .where('store_id')
        .equals(employee.store_id)
        .filter(emp => emp.email === updates.email && emp.id !== employeeId && !emp._deleted)
        .first();
      
      if (existingByEmail) {
        throw new Error('An employee with this email already exists');
      }
    }

    // Clean updates: remove undefined values and handle empty strings for optional fields
    const cleanedUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      // Include defined values (including null for balance fields)
      if (value !== undefined) {
        // Convert empty strings to null for optional text fields (but keep required fields)
        if (typeof value === 'string' && value === '' && key !== 'name' && key !== 'email' && key !== 'role') {
          cleanedUpdates[key] = null;
        } else {
          cleanedUpdates[key] = value;
        }
      }
    }

    // Always update these fields
    cleanedUpdates.updated_at = new Date().toISOString();
    cleanedUpdates._synced = false;

    console.log(`🔄 Updating employee ${employeeId} with:`, cleanedUpdates);

    const updateCount = await getDB().users.update(employeeId, cleanedUpdates);

    if (updateCount === 0) {
      console.error(`❌ Failed to update employee ${employeeId}. Update count: ${updateCount}`);
      throw new Error('Failed to update employee. Record may not exist or no changes were made.');
    }

    console.log(`✅ Employee updated successfully: ${employeeId}, records updated: ${updateCount}`);
    
    // Verify the update was applied
    const updated = await getDB().users.get(employeeId);
    if (updated) {
      console.log(`✅ Verified employee after update:`, updated);
    }
  }

  /**
   * Soft delete an employee
   */
  static async deleteEmployee(employeeId: string): Promise<void> {
    const employee = await getDB().users.get(employeeId);
    if (!employee || employee._deleted) {
      throw new Error('Employee not found');
    }

    await getDB().users.update(employeeId, {
      _deleted: true,
      _synced: false,
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Count employees by role (for quota checking)
   */
  static async getRoleCounts(storeId: string): Promise<{ cashier: number; manager: number }> {
    const employees = await this.getEmployees(storeId);
    return {
      cashier: employees.filter(emp => emp.role === 'cashier').length,
      manager: employees.filter(emp => emp.role === 'manager').length
    };
  }
}

