/**
 * Branch Deletion Handler
 * 
 * Handles branch soft deletion and its impact on users:
 * - Sets branch_id to null for affected users (manager/cashier)
 * - Creates notifications for affected users
 * - Prevents operations on deleted branches
 */

import { db } from '../lib/db';
import { notificationService } from './notificationService';

export class BranchDeletionHandler {
  /**
   * Handles branch soft deletion
   * - Sets branch_id to null for affected users
   * - Notifies users about branch deletion
   * - Prevents operations on deleted branch
   * 
   * @param branchId - Branch ID being deleted
   * @param storeId - Store ID the branch belongs to
   * @param deletedBy - User ID performing the deletion
   */
  static async handleBranchDeletion(
    branchId: string,
    storeId: string,
    deletedBy: string
  ): Promise<void> {
    // Get branch info before deletion
    const branch = await db.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    
    const branchName = branch.name;
    
    // Find all users assigned to this branch
    const affectedUsers = await db.users
      .where('store_id')
      .equals(storeId)
      .filter(u => u.branch_id === branchId && !u._deleted)
      .toArray();
    
    console.log(`🗑️ Branch deletion: Found ${affectedUsers.length} users assigned to branch ${branchName}`);
    
    // Update users: set branch_id to null
    for (const user of affectedUsers) {
      await db.users.update(user.id, {
        branch_id: null,
        updated_at: new Date().toISOString(),
        _synced: false
      });
      
      // Create notification for user
      try {
        await notificationService.createNotification(
          storeId,
          'warning',
          'Branch Access Revoked',
          `Your assigned branch "${branchName}" has been deleted. Please contact an administrator to be reassigned to a new branch.`,
          {
            priority: 'high',
            metadata: { 
              branchId, 
              branchName,
              userId: user.id,
              action: 'branch_deleted'
            }
          }
        );
        
        console.log(`📧 Notification sent to user ${user.name} (${user.id}) about branch deletion`);
      } catch (error) {
        console.error(`Failed to create notification for user ${user.id}:`, error);
        // Continue with other users even if notification fails
      }
    }
    
    console.log(`✅ Branch deletion handled: ${affectedUsers.length} users updated, branch_id set to null`);
  }
  
  /**
   * Validates branch is not deleted before operations
   * @param branchId - Branch ID to validate
   * @throws Error if branch is deleted
   */
  static async validateBranchNotDeleted(
    branchId: string
  ): Promise<void> {
    const branch = await db.branches.get(branchId);
    
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    
    if (branch._deleted) {
      throw new Error(
        `Branch "${branch.name}" (${branchId}) has been deleted. ` +
        `Operations on this branch are not allowed.`
      );
    }
  }
  
  /**
   * Gets all users affected by branch deletion (for preview before deletion)
   * @param branchId - Branch ID
   * @param storeId - Store ID
   * @returns Array of affected users with their details
   */
  static async getAffectedUsers(
    branchId: string,
    storeId: string
  ): Promise<Array<{
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'cashier';
  }>> {
    const affectedUsers = await db.users
      .where('store_id')
      .equals(storeId)
      .filter(u => u.branch_id === branchId && !u._deleted)
      .toArray();
    
    return affectedUsers.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }));
  }
}

