import { authenticateSocket } from '../middleware/auth.js';
import documentService from '../services/documentService.js';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

class DocumentSocketHandler {
  constructor(io) {
    this.io = io;
    this.documentRooms = new Map(); // Track users in document rooms
    this.setupSocketHandlers();
    this.setupRedisSubscription();
  }

  setupSocketHandlers() {
    this.io.use(authenticateSocket);

    this.io.on('connection', (socket) => {
      logger.info('User connected', { userId: socket.user.id, socketId: socket.id });

      // Join document room
      socket.on('join_document', async (data) => {
        try {
          const { documentId } = data;
          
          // Verify user has access to document
          await documentService.getDocument(documentId, socket.user.id);
          
          // Join room
          socket.join(`document:${documentId}`);
          
          // Track user in room
          if (!this.documentRooms.has(documentId)) {
            this.documentRooms.set(documentId, new Set());
          }
          this.documentRooms.get(documentId).add(socket.user.id);
          
          // Notify others in room
          socket.to(`document:${documentId}`).emit('user_joined', {
            userId: socket.user.id,
            username: socket.user.username
          });
          
          // Send current active users to new user
          const activeUsers = Array.from(this.documentRooms.get(documentId));
          socket.emit('active_users', { users: activeUsers });
          
          logger.info('User joined document', { 
            userId: socket.user.id, 
            documentId,
            activeUsers: activeUsers.length
          });
          
        } catch (error) {
          logger.error('Join document error:', error);
          socket.emit('error', { message: 'Failed to join document' });
        }
      });

      // Leave document room
      socket.on('leave_document', (data) => {
        const { documentId } = data;
        this.leaveDocumentRoom(socket, documentId);
      });

      // Real-time document editing
      socket.on('document_change', async (data) => {
        try {
          const { documentId, changes, version } = data;
          
          // Verify user has write access
          const document = await documentService.getDocument(documentId, socket.user.id);
          if (!document.userPermission || document.userPermission === 'read') {
            socket.emit('error', { message: 'Insufficient permissions' });
            return;
          }
          
          // Broadcast changes to other users in the room
          socket.to(`document:${documentId}`).emit('document_changed', {
            changes,
            version,
            userId: socket.user.id,
            username: socket.user.username,
            timestamp: new Date().toISOString()
          });
          
          // Optionally save changes to database (debounced)
          // This could be implemented with a debounce mechanism
          
        } catch (error) {
          logger.error('Document change error:', error);
          socket.emit('error', { message: 'Failed to process document change' });
        }
      });

      // Cursor position updates
      socket.on('cursor_position', (data) => {
        const { documentId, position } = data;
        socket.to(`document:${documentId}`).emit('cursor_updated', {
          userId: socket.user.id,
          username: socket.user.username,
          position,
          timestamp: new Date().toISOString()
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('User disconnected', { userId: socket.user.id, socketId: socket.id });
        
        // Remove user from all document rooms
        for (const [documentId, users] of this.documentRooms.entries()) {
          if (users.has(socket.user.id)) {
            this.leaveDocumentRoom(socket, documentId);
          }
        }
      });
    });
  }

  setupRedisSubscription() {
    // Subscribe to document updates from Redis
    redisClient.subscribe('document_updates', (message) => {
      const { type, data, userId } = message;
      
      switch (type) {
        case 'document_created':
          this.io.emit('document_created', { document: data, userId });
          break;
          
        case 'document_updated':
          this.io.to(`document:${data.id}`).emit('document_updated', { document: data, userId });
          break;
          
        case 'document_deleted':
          this.io.to(`document:${data.id}`).emit('document_deleted', { documentId: data.id, userId });
          break;
          
        case 'collaborator_added':
          this.io.to(`document:${data.documentId}`).emit('collaborator_added', { 
            documentId: data.documentId,
            collaborator: data.collaborator,
            userId 
          });
          break;
          
        default:
          logger.warn('Unknown document update type:', type);
      }
    });
  }

  leaveDocumentRoom(socket, documentId) {
    socket.leave(`document:${documentId}`);
    
    // Remove user from room tracking
    if (this.documentRooms.has(documentId)) {
      this.documentRooms.get(documentId).delete(socket.user.id);
      
      // Clean up empty rooms
      if (this.documentRooms.get(documentId).size === 0) {
        this.documentRooms.delete(documentId);
      }
    }
    
    // Notify others in room
    socket.to(`document:${documentId}`).emit('user_left', {
      userId: socket.user.id,
      username: socket.user.username
    });
    
    logger.info('User left document', { 
      userId: socket.user.id, 
      documentId,
      remainingUsers: this.documentRooms.get(documentId)?.size || 0
    });
  }
}

export default DocumentSocketHandler;