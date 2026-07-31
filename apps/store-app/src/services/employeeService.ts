import { getDB } from '../lib/db';
import { Employee } from '../types';
import { Entity } from '../types/accounting';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

/**
 * Invoke the admin-users Edge Function (server-side holder of the service
 * role key) and normalize its error shape. Non-2xx responses surface their
 * JSON `error` message.
 */
async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = await (error as { context?: Response }).context?.json();
      if (ctx?.error) message = ctx.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data as T;
}

/**
 * EmployeeService - Following offline-first architecture pattern
 * Creates auth users in Supabase, then stores profile in IndexedDB for sync
 */
export class EmployeeService {
  /**
   * Ensure an entity record exists for an employee
   * Creates entity if it doesn't exist, otherwise returns existing entity
   * @param employee - Employee/user object
   * @param synced - Whether the entity should be marked as synced (defaults to employee's _synced)
   * @returns The entity record
   */
  private static async ensureEmployeeEntity(
    employee: Employee,
    synced?: boolean
  ): Promise<Entity> {
    // Check if entity already exists
    const existingEntity = await getDB().entities.get(employee.id);
    if (existingEntity) {
      return existingEntity;
    }

    // Create entity record
    const entity: Entity = {
      id: employee.id, // Use same ID as employee for backward compatibility
      store_id: employee.store_id,
      branch_id: employee.branch_id || null,
      entity_type: 'employee',
      entity_code: `EMP-${employee.id.slice(0, 8).toUpperCase()}`,
      name: employee.name,
      phone: employee.phone || null,
      is_system_entity: false,
      is_active: true, // Default to active, employees don't have is_active field
      customer_data: null,
      supplier_data: null,
      created_at: employee.created_at,
      updated_at: employee.updated_at,
      _synced: synced !== undefined ? synced : (employee._synced ?? false)
    };

    return entity;
  }

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

    // Create everything server-side via the admin-users Edge Function:
    // auth user (email confirmed, no auto-login), users row (with rollback
    // of the auth user on failure), global email-uniqueness check, and the
    // matching employee entity. The service role key never ships to clients.
    const now = new Date().toISOString();
    const result = await invokeAdminUsers<{
      user: { id: string };
      entity_created: boolean;
    }>({
      action: 'create_user',
      email: employeeData.email,
      password,
      name: employeeData.name,
      role: employeeData.role,
      store_id: storeId,
      branch_id: employeeData.branch_id || null,
      phone: employeeData.phone || null,
      address: employeeData.address || null,
      monthly_salary: employeeData.monthly_salary || null,
      salary_currency: employeeData.salary_currency || null,
      working_hours_start: employeeData.working_hours_start || null,
      working_hours_end: employeeData.working_hours_end || null,
      working_days: employeeData.working_days || null,
    });

    const userId = result.user.id;

    // Create employee record for IndexedDB
    const employee: Employee = {
      id: userId,
      store_id: storeId,
      ...employeeData,
      created_at: now,
      updated_at: now,
      _synced: true, // Server row already exists
      _deleted: false
    };

    // Store in IndexedDB (already synced)
    await getDB().users.add(employee);

    if (result.entity_created) {
      // Mirror the server-created entity in IndexedDB (already synced)
      const entity: Entity = {
        id: userId,
        store_id: storeId,
        branch_id: employeeData.branch_id || null,
        entity_type: 'employee',
        entity_code: `EMP-${userId.slice(0, 8).toUpperCase()}`,
        name: employeeData.name,
        phone: employeeData.phone || null,
        is_system_entity: false,
        is_active: true,
        customer_data: null,
        supplier_data: null,
        created_at: now,
        updated_at: now,
        _synced: true
      };
      await getDB().entities.add(entity);
      console.log(`✅ Created entity record for employee: ${employeeData.name}`);
    } else {
      console.warn('⚠️ User created but entity record creation failed. Entity can be created later.');
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

    // Create corresponding entity record
    try {
      const entity = await this.ensureEmployeeEntity(employee, false);
      await getDB().entities.add(entity);
      console.log(`✅ Created entity record for employee: ${employee.name}`);
    } catch (error) {
      console.error('Error creating employee entity:', error);
      // Don't fail the whole operation - entity can be created later via sync
    }

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

