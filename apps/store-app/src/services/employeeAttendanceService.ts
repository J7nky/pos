import { getDB } from '../lib/db';
import { EmployeeAttendance } from '../types';
import { createId } from '../lib/db';

/**
 * Service for managing employee attendance (check-in/check-out)
 */
export class EmployeeAttendanceService {
  /**
   * Record employee check-in
   */
  static async checkIn(employeeId: string, storeId: string, notes?: string): Promise<EmployeeAttendance> {
    // Check if employee already has an active check-in (no check-out)
    const activeCheckIn = await getDB().employee_attendance
      .where('employee_id')
      .equals(employeeId)
      .filter(att => att.check_out_at === null && !att._deleted)
      .first();

    if (activeCheckIn) {
      throw new Error('Employee already checked in. Please check out first.');
    }

    const now = new Date().toISOString();
    const attendance: EmployeeAttendance = {
      id: createId(),
      store_id: storeId,
      employee_id: employeeId,
      check_in_at: now,
      check_out_at: null,
      notes: notes || null,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false
    };

    await getDB().employee_attendance.add(attendance);
    return attendance;
  }

  /**
   * Record employee check-out
   */
  static async checkOut(employeeId: string, notes?: string): Promise<EmployeeAttendance | null> {
    // Find active check-in
    const activeCheckIn = await getDB().employee_attendance
      .where('employee_id')
      .equals(employeeId)
      .filter(att => att.check_out_at === null && !att._deleted)
      .first();

    if (!activeCheckIn) {
      throw new Error('No active check-in found. Please check in first.');
    }

    const now = new Date().toISOString();
    await getDB().employee_attendance.update(activeCheckIn.id, {
      check_out_at: now,
      notes: notes || activeCheckIn.notes,
      updated_at: now,
      _synced: false
    });

    return {
      ...activeCheckIn,
      check_out_at: now,
      notes: notes || activeCheckIn.notes,
      updated_at: now
    };
  }

  /**
   * Get current check-in status for an employee
   */
  static async getCurrentStatus(employeeId: string): Promise<EmployeeAttendance | null> {
    return await getDB().employee_attendance
      .where('employee_id')
      .equals(employeeId)
      .filter(att => att.check_out_at === null && !att._deleted)
      .first() || null;
  }

  /**
   * Get attendance history for an employee
   */
  static async getAttendanceHistory(
    employeeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<EmployeeAttendance[]> {
    let query = getDB().employee_attendance
      .where('employee_id')
      .equals(employeeId)
      .filter(att => !att._deleted);

    const results = await query.toArray();

    // Filter by date range if provided
    if (startDate || endDate) {
      return results.filter(att => {
        const checkInDate = new Date(att.check_in_at);
        if (startDate && checkInDate < new Date(startDate)) return false;
        if (endDate && checkInDate > new Date(endDate)) return false;
        return true;
      }).sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime());
    }

    return results.sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime());
  }

  /**
   * Get attendance history for all employees in a store
   */
  static async getStoreAttendance(
    storeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<EmployeeAttendance[]> {
    let query = getDB().employee_attendance
      .where('store_id')
      .equals(storeId)
      .filter(att => !att._deleted);

    const results = await query.toArray();

    // Filter by date range if provided
    if (startDate || endDate) {
      return results.filter(att => {
        const checkInDate = new Date(att.check_in_at);
        if (startDate && checkInDate < new Date(startDate)) return false;
        if (endDate && checkInDate > new Date(endDate)) return false;
        return true;
      }).sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime());
    }

    return results.sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime());
  }

  /**
   * Calculate hours worked for a specific attendance record
   */
  static calculateHoursWorked(attendance: EmployeeAttendance): number | null {
    if (!attendance.check_out_at) return null;
    const checkIn = new Date(attendance.check_in_at);
    const checkOut = new Date(attendance.check_out_at);
    const diffMs = checkOut.getTime() - checkIn.getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Get total hours worked for an employee in a date range
   */
  static async getTotalHoursWorked(
    employeeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<number> {
    const history = await this.getAttendanceHistory(employeeId, startDate, endDate);
    return history.reduce((total, att) => {
      const hours = this.calculateHoursWorked(att);
      return total + (hours || 0);
    }, 0);
  }
}

