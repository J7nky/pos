import { db } from '../lib/db';
import { Employee } from Emotion '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * EmployeeService - Following offline-first architecture pattern
 * All operations save to IndexedDB first, then sync via syncService
 */
export class EmployeeService {
  /**
   * Get all employees for a store (excluding deleted ones)
   */
  static async getEmployees(storeId: string): Promise<Employee[]> {
    return await db.users
      .where('store_id')
      .equals(storeId)
      .filter(emp => !emp._deleted)
      .toArray();
  }

  /**
   * Get a single employee by ID
   */
  static async getEmployee(employeeId: string): Promise<Employee | undefined> {
    return await db.users.get(employeeId);
  }

  /**
   * Get employees by role for a store (for quota checking)
   */
  static async getEmployeesByRole(storeId: string, role: 'manager' | 'cashier'): Promise<Employee[]> {
    return await db.users
      .where('store_id')
      .equals(storeId)
      .filter(emp => emp.role === role && !emp._deleted)
      .toArray();
  }

  /**
   * Create a new employee
   * Validates role limits (max 2 cashiers, max 1 manager)
   */
  static async createEmployee(storeId: string, employeeData: Omit<Employee, 'id' | 'store_id' | 'created_at' | 'updated_at' | '_synced' | '_deleted'>): Promise<Employee> {
    // Validate role limits
    const existingEmployees = await this.getEmployeesByRole(storeId, employeeData.role);
    const maxAllowed = employeeData.role === 'cashier' ? 2 : 1;
    
    if (existingEmployees.length >= maxAllowed) {
      throw new Error(`Cannot add more ${employeeData.role}s. Maximum allowed: ${maxAllowed}`);
    }

    // Check if email already exists
    const existingByEmail = await db.users
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

    await db.users.add(employee);
    return employee;
  }

  /**
   * Update an existing employee
   */
  static async updateEmployee(employeeId: string, updates: Partial<Omit<Employee, 'id' | 'store_id' | 'created_at' | '_synced'>>): Promise<void> {
    const employee = await db.users.get(employeeId);
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
      const existingByEmail = await db.users
        .where('store_id')
        .equals(employee.store_id)
        .filter(emp => emp.email === updates.email && emp.id !== employeeId && !emp._deleted)
        .first();
      
      if (existingByEmail) {
        throw new Error('An employee with this email already exists');
      }
    }

    await db.users.update(employeeId, {
      ...updates,
      updated_at: new Date().toISOString(),
      _synced: false
    });
  }

  /**
   * Soft delete an employee
   */
  static async deleteEmployee(employeeId: string): Promise<void> {
    const employee = await db.users.get(employeeId);
    if (!employee || employee._deleted) {
      throw new Error('Employee not found');
    }

    await db.users.update(employeeId, {
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

