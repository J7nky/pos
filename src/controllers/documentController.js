import documentService from '../services/documentService.js';
import logger from '../utils/logger.js';

class DocumentController {
  async createDocument(req, res) {
    try {
      const document = await documentService.createDocument(req.user.id, req.body);
      
      res.status(201).json({
        success: true,
        message: 'Document created successfully',
        data: { document }
      });
    } catch (error) {
      logger.error('Create document controller error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to create document'
      });
    }
  }

  async getDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.getDocument(id, req.user.id);
      
      res.json({
        success: true,
        data: { document }
      });
    } catch (error) {
      logger.error('Get document controller error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('Access denied')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to get document'
      });
    }
  }

  async updateDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.updateDocument(id, req.user.id, req.body);
      
      res.json({
        success: true,
        message: 'Document updated successfully',
        data: { document }
      });
    } catch (error) {
      logger.error('Update document controller error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('permissions')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to update document'
      });
    }
  }

  async deleteDocument(req, res) {
    try {
      const { id } = req.params;
      await documentService.deleteDocument(id, req.user.id);
      
      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      logger.error('Delete document controller error:', error);
      
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to delete document'
      });
    }
  }

  async getUserDocuments(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      const documents = await documentService.getUserDocuments(req.user.id, page, limit);
      
      res.json({
        success: true,
        data: { 
          documents,
          pagination: {
            page,
            limit,
            total: documents.length
          }
        }
      });
    } catch (error) {
      logger.error('Get user documents controller error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get documents'
      });
    }
  }

  async addCollaborator(req, res) {
    try {
      const { id } = req.params;
      const collaborator = await documentService.addCollaborator(id, req.user.id, req.body);
      
      res.status(201).json({
        success: true,
        message: 'Collaborator added successfully',
        data: { collaborator }
      });
    } catch (error) {
      logger.error('Add collaborator controller error:', error);
      
      if (error.message.includes('owners can add')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to add collaborator'
      });
    }
  }

  async getCollaborators(req, res) {
    try {
      const { id } = req.params;
      const collaborators = await documentService.getDocumentCollaborators(id, req.user.id);
      
      res.json({
        success: true,
        data: { collaborators }
      });
    } catch (error) {
      logger.error('Get collaborators controller error:', error);
      
      if (error.message.includes('Access denied')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to get collaborators'
      });
    }
  }
}

export default new DocumentController();