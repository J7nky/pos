import database from '../config/database.js';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

class DocumentService {
  async createDocument(userId, documentData) {
    const { title, content = '', isPublic = false } = documentData;
    
    try {
      const result = await database.query(`
        INSERT INTO documents (title, content, owner_id, is_public)
        VALUES ($1, $2, $3, $4)
        RETURNING id, title, content, owner_id, is_public, version, created_at, updated_at
      `, [title, content, userId, isPublic]);

      const document = result.rows[0];

      // Publish real-time update
      await this.publishDocumentUpdate('document_created', document, userId);

      return this.formatDocument(document);
    } catch (error) {
      logger.error('Create document error:', error);
      throw error;
    }
  }

  async getDocument(documentId, userId) {
    try {
      const result = await database.query(`
        SELECT d.*, u.username as owner_username,
               get_user_document_permission($2, $1) as user_permission
        FROM documents d
        JOIN users u ON d.owner_id = u.id
        WHERE d.id = $1
      `, [documentId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      const document = result.rows[0];

      if (!document.user_permission) {
        throw new Error('Access denied');
      }

      return this.formatDocument(document);
    } catch (error) {
      logger.error('Get document error:', error);
      throw error;
    }
  }

  async updateDocument(documentId, userId, updates) {
    try {
      // Check permissions
      const permissionResult = await database.query(
        'SELECT get_user_document_permission($1, $2) as permission',
        [userId, documentId]
      );

      const permission = permissionResult.rows[0]?.permission;
      if (!permission || permission === 'read') {
        throw new Error('Insufficient permissions');
      }

      // Build update query dynamically
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (updates.title !== undefined) {
        updateFields.push(`title = $${paramCount++}`);
        values.push(updates.title);
      }

      if (updates.content !== undefined) {
        updateFields.push(`content = $${paramCount++}`);
        values.push(updates.content);
      }

      if (updates.isPublic !== undefined) {
        updateFields.push(`is_public = $${paramCount++}`);
        values.push(updates.isPublic);
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`version = version + 1`);
      values.push(documentId);

      const result = await database.query(`
        UPDATE documents 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, title, content, owner_id, is_public, version, created_at, updated_at
      `, values);

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      const document = result.rows[0];

      // Publish real-time update
      await this.publishDocumentUpdate('document_updated', document, userId);

      return this.formatDocument(document);
    } catch (error) {
      logger.error('Update document error:', error);
      throw error;
    }
  }

  async deleteDocument(documentId, userId) {
    try {
      // Check if user is owner
      const result = await database.query(
        'DELETE FROM documents WHERE id = $1 AND owner_id = $2 RETURNING id',
        [documentId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found or access denied');
      }

      // Publish real-time update
      await this.publishDocumentUpdate('document_deleted', { id: documentId }, userId);

      return true;
    } catch (error) {
      logger.error('Delete document error:', error);
      throw error;
    }
  }

  async getUserDocuments(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;

      const result = await database.query(`
        SELECT DISTINCT d.id, d.title, d.content, d.owner_id, d.is_public, 
               d.version, d.created_at, d.updated_at, u.username as owner_username,
               get_user_document_permission($1, d.id) as user_permission
        FROM documents d
        JOIN users u ON d.owner_id = u.id
        LEFT JOIN document_collaborators dc ON d.id = dc.document_id
        WHERE d.owner_id = $1 
           OR dc.user_id = $1 
           OR d.is_public = true
        ORDER BY d.updated_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      const documents = result.rows
        .filter(doc => doc.user_permission) // Only include documents user has access to
        .map(doc => this.formatDocument(doc));

      return documents;
    } catch (error) {
      logger.error('Get user documents error:', error);
      throw error;
    }
  }

  async addCollaborator(documentId, userId, collaboratorData) {
    const { userId: collaboratorId, permission } = collaboratorData;

    try {
      // Check if user is owner or admin
      const permissionResult = await database.query(
        'SELECT get_user_document_permission($1, $2) as permission',
        [userId, documentId]
      );

      const userPermission = permissionResult.rows[0]?.permission;
      if (userPermission !== 'admin') {
        throw new Error('Only document owners can add collaborators');
      }

      // Add collaborator
      await database.query(`
        INSERT INTO document_collaborators (document_id, user_id, permission)
        VALUES ($1, $2, $3)
        ON CONFLICT (document_id, user_id) 
        DO UPDATE SET permission = EXCLUDED.permission
      `, [documentId, collaboratorId, permission]);

      // Get collaborator info
      const collaboratorResult = await database.query(
        'SELECT id, username, email FROM users WHERE id = $1',
        [collaboratorId]
      );

      const collaborator = collaboratorResult.rows[0];

      // Publish real-time update
      await this.publishDocumentUpdate('collaborator_added', {
        documentId,
        collaborator: {
          id: collaborator.id,
          username: collaborator.username,
          permission
        }
      }, userId);

      return {
        id: collaborator.id,
        username: collaborator.username,
        email: collaborator.email,
        permission
      };
    } catch (error) {
      logger.error('Add collaborator error:', error);
      throw error;
    }
  }

  async getDocumentCollaborators(documentId, userId) {
    try {
      // Check permissions
      const permissionResult = await database.query(
        'SELECT get_user_document_permission($1, $2) as permission',
        [userId, documentId]
      );

      const permission = permissionResult.rows[0]?.permission;
      if (!permission) {
        throw new Error('Access denied');
      }

      const result = await database.query(`
        SELECT u.id, u.username, u.email, dc.permission, dc.created_at
        FROM document_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.document_id = $1
        ORDER BY dc.created_at ASC
      `, [documentId]);

      return result.rows;
    } catch (error) {
      logger.error('Get collaborators error:', error);
      throw error;
    }
  }

  async publishDocumentUpdate(eventType, data, userId) {
    try {
      const message = {
        type: eventType,
        data,
        userId,
        timestamp: new Date().toISOString()
      };

      await redisClient.publish('document_updates', message);
    } catch (error) {
      logger.error('Publish document update error:', error);
      // Don't throw error for publishing failures
    }
  }

  formatDocument(document) {
    return {
      id: document.id,
      title: document.title,
      content: document.content,
      ownerId: document.owner_id,
      ownerUsername: document.owner_username,
      isPublic: document.is_public,
      version: document.version,
      userPermission: document.user_permission,
      createdAt: document.created_at,
      updatedAt: document.updated_at
    };
  }
}

export default new DocumentService();