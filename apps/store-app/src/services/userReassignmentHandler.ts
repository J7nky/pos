/**
 * User Reassignment Handler
 * 
 * Handles user branch reassignment:
 * - Validates new branch exists and belongs to store
 * - Updates user branch_id
 * - Closes any active sessions in old branch
 * - Creates notification for user
 */

import { db } from '../lib/db';
import { notificationService } from './notificationService';
import { BranchAccessValidationService } from './branchAccessValidationService';

export class UserReassignmentHandler {
  /**
   * Reassigns user to a new branch
   * - Validates new branch exists and belongs to store
   * - Updates user branch_id
   * - Closes any active sessions in old branch
   * - Creates notification
   * 
   * @param userId - User ID to reassign
   * @param newBranchId - New branch ID to assign
   * @param storeId - Store ID
   * @param reassignedBy - User ID performing the reassignment
   */
  static async reassignUserBranch(
    userId: string,
    newBranchId: string,
    storeId: string,
    reassignedBy: string
  ): Promise<void> {
    const user = await db.users.get(userId);
    
    if (!user || user.store_id !== storeId) {
      throw new Error('User not found or does not belong to store');
    }
    
    if (user.role === 'admin') {
      throw new Error(
        'Admin users cannot be reassigned to a branch. ' +
        'Admins can access all branches and do not need a specific branch assignment.'
      );
    }
    
    // Validate new branch
    const newBranch = await db.branches.get(newBranchId);
    if (!newBranch || newBranch._deleted || newBranch.store_id !== storeId) {
      throw new Error('Invalid branch for reassignment. Branch does not exist, is deleted, or does not belong to this store.');
    }
    
    const oldBranchId = user.branch_id;
    const oldBranchName = oldBranchId 
      ? (await db.branches.get(oldBranchId))?.name || 'Unknown Branch'
      : 'No Branch';
    const newBranchName = newBranch.name;
    
    // Close any active cash drawer sessions in old branch
    if (oldBranchId) {
      const activeSessions = await db.cash_drawer_sessions
        .where(['store_id', 'branch_id'])
        .equals([storeId, oldBranchId])
        .filter(s => s.status === 'open' && s.opened_by === userId)
        .toArray();
      
      for (const session of activeSessions) {
        try {
          await db.closeCashDrawerSession(
            session.id,
            session.opening_amount, // Use opening amount as actual
            reassignedBy,
            `Session closed due to branch reassignment from "${oldBranchName}" to "${newBranchName}"`
          );
          console.log(`💰 Closed cash drawer session ${session.id} due to branch reassignment`);
        } catch (error) {
          console.error(`Failed to close session ${session.id}:`, error);
          // Continue with reassignment even if session close fails
        }
      }
    }
    
    // Update user
    await db.users.update(userId, {
      branch_id: newBranchId,
      updated_at: new Date().toISOString(),
      _synced: false
    });
    
    console.log(`✅ User ${user.name} (${user.id}) reassigned from "${oldBranchName}" to "${newBranchName}"`);
    
    // Create notification
    try {
      await notificationService.createNotification(
        storeId,
        'info',
        'Branch Reassignment',
        `You have been reassigned to branch: "${newBranchName}"${oldBranchId ? ` (previously: "${oldBranchName}")` : ''}`,
        {
          priority: 'medium',
          metadata: { 
            oldBranchId, 
            newBranchId,
            oldBranchName,
            newBranchName,
            userId,
            reassignedBy,
            action: 'branch_reassigned'
          }
        }
      );
      
      console.log(`📧 Notification sent to user ${user.name} about branch reassignment`);
    } catch (error) {
      console.error(`Failed to create notification for user ${userId}:`, error);
      // Continue even if notification fails
    }
  }
  
  /**
   * Validates that a user can be reassigned to a branch
   * @param userId - User ID
   * @param newBranchId - New branch ID
   * @param storeId - Store ID
   * @returns Validation result with error message if invalid
   */
  static async validateReassignment(
    userId: string,
    newBranchId: string,
    storeId: string
  ): Promise<{ valid: boolean; error?: string }> {
    const user = await db.users.get(userId);
    
    if (!user || user.store_id !== storeId) {
      return {
        valid: false,
        error: 'User not found or does not belong to store'
      };
    }
    
    if (user.role === 'admin') {
      return {
        valid: false,
        error: 'Admin users cannot be reassigned to a branch'
      };
    }
    
    const newBranch = await db.branches.get(newBranchId);
    if (!newBranch) {
      return {
        valid: false,
        error: 'Branch not found'
      };
    }
    
    if (newBranch._deleted) {
      return {
        valid: false,
        error: 'Cannot reassign to a deleted branch'
      };
    }
    
    if (newBranch.store_id !== storeId) {
      return {
        valid: false,
        error: 'Branch does not belong to this store'
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Gets active sessions for a user in a specific branch
   * Useful for previewing what will be closed during reassignment
   * @param userId - User ID
   * @param branchId - Branch ID
   * @param storeId - Store ID
   * @returns Array of active sessions
   */
  static async getActiveSessionsInBranch(
    userId: string,
    branchId: string,
    storeId: string
  ): Promise<Array<{
    id: string;
    opened_at: string;
    opening_amount: number;
    status: string;
  }>> {
    const sessions = await db.cash_drawer_sessions
      .where(['store_id', 'branch_id'])
      .equals([storeId, branchId])
      .filter(s => s.status === 'open' && s.opened_by === userId)
      .toArray();
    
    return sessions.map(session => ({
      id: session.id,
      opened_at: session.opened_at,
      opening_amount: session.opening_amount || 0,
      status: session.status
    }));
  }
}

