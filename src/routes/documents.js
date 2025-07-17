import express from 'express';
import documentController from '../controllers/documentController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate, validateParams, schemas } from '../utils/validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Document CRUD
router.post('/',
  validate(schemas.createDocument),
  documentController.createDocument
);

router.get('/',
  documentController.getUserDocuments
);

router.get('/:id',
  validateParams(schemas.documentId),
  documentController.getDocument
);

router.put('/:id',
  validateParams(schemas.documentId),
  validate(schemas.updateDocument),
  documentController.updateDocument
);

router.delete('/:id',
  validateParams(schemas.documentId),
  documentController.deleteDocument
);

// Collaboration
router.post('/:id/collaborators',
  validateParams(schemas.documentId),
  validate(schemas.addCollaborator),
  documentController.addCollaborator
);

router.get('/:id/collaborators',
  validateParams(schemas.documentId),
  documentController.getCollaborators
);

export default router;