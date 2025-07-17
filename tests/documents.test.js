import request from 'supertest';
import express from 'express';
import authRoutes from '../src/routes/auth.js';
import documentRoutes from '../src/routes/documents.js';
import database from '../src/config/database.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

describe('Documents', () => {
  let testUser = {
    username: 'docuser',
    email: 'doc@example.com',
    password: 'password123',
    firstName: 'Doc',
    lastName: 'User'
  };
  
  let accessToken;
  let testDocument;

  beforeAll(async () => {
    // Clean up test user if exists
    await database.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    
    // Register test user
    await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    // Login to get access token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    accessToken = loginResponse.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await database.query('DELETE FROM users WHERE email = $1', [testUser.email]);
  });

  describe('POST /api/documents', () => {
    it('should create a new document', async () => {
      const documentData = {
        title: 'Test Document',
        content: 'This is a test document',
        isPublic: false
      };

      const response = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(documentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document.title).toBe(documentData.title);
      expect(response.body.data.document.content).toBe(documentData.content);
      
      testDocument = response.body.data.document;
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/documents')
        .send({
          title: 'Test Document',
          content: 'This is a test document'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/documents/:id', () => {
    it('should get document by id', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocument.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document.id).toBe(testDocument.id);
      expect(response.body.data.document.title).toBe(testDocument.title);
    });

    it('should return 404 for non-existent document', async () => {
      const response = await request(app)
        .get('/api/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/documents/:id', () => {
    it('should update document', async () => {
      const updateData = {
        title: 'Updated Test Document',
        content: 'This is updated content'
      };

      const response = await request(app)
        .put(`/api/documents/${testDocument.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.document.title).toBe(updateData.title);
      expect(response.body.data.document.content).toBe(updateData.content);
      expect(response.body.data.document.version).toBe(testDocument.version + 1);
    });
  });

  describe('GET /api/documents', () => {
    it('should get user documents', async () => {
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.documents)).toBe(true);
      expect(response.body.data.documents.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('should delete document', async () => {
      const response = await request(app)
        .delete(`/api/documents/${testDocument.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Document deleted successfully');
    });
  });
});