import Joi from 'joi';

export const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
    firstName: Joi.string().max(100).optional(),
    lastName: Joi.string().max(100).optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  }),

  createDocument: Joi.object({
    title: Joi.string().min(1).max(255).required(),
    content: Joi.string().allow('').optional(),
    isPublic: Joi.boolean().optional()
  }),

  updateDocument: Joi.object({
    title: Joi.string().min(1).max(255).optional(),
    content: Joi.string().allow('').optional(),
    isPublic: Joi.boolean().optional()
  }),

  addCollaborator: Joi.object({
    userId: Joi.string().uuid().required(),
    permission: Joi.string().valid('read', 'write', 'admin').required()
  }),

  documentId: Joi.object({
    id: Joi.string().uuid().required()
  })
};

export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

export const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};