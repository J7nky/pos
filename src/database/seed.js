import bcrypt from 'bcryptjs';
import database from '../config/database.js';
import logger from '../utils/logger.js';

async function seedDatabase() {
  try {
    logger.info('Starting database seeding...');
    
    // Create sample users
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    const users = [
      {
        username: 'admin',
        email: 'admin@example.com',
        password_hash: hashedPassword,
        first_name: 'Admin',
        last_name: 'User'
      },
      {
        username: 'john_doe',
        email: 'john@example.com',
        password_hash: hashedPassword,
        first_name: 'John',
        last_name: 'Doe'
      },
      {
        username: 'jane_smith',
        email: 'jane@example.com',
        password_hash: hashedPassword,
        first_name: 'Jane',
        last_name: 'Smith'
      }
    ];
    
    for (const user of users) {
      await database.query(`
        INSERT INTO users (username, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO NOTHING
      `, [user.username, user.email, user.password_hash, user.first_name, user.last_name]);
    }
    
    // Create sample documents
    const adminUser = await database.query('SELECT id FROM users WHERE username = $1', ['admin']);
    const johnUser = await database.query('SELECT id FROM users WHERE username = $1', ['john_doe']);
    
    if (adminUser.rows.length > 0 && johnUser.rows.length > 0) {
      const adminId = adminUser.rows[0].id;
      const johnId = johnUser.rows[0].id;
      
      const documents = [
        {
          title: 'Welcome Document',
          content: 'This is a sample document for testing real-time collaboration.',
          owner_id: adminId,
          is_public: true
        },
        {
          title: 'Private Notes',
          content: 'These are private notes that only the owner can see.',
          owner_id: johnId,
          is_public: false
        },
        {
          title: 'Shared Project',
          content: 'This document is shared between multiple users.',
          owner_id: adminId,
          is_public: false
        }
      ];
      
      for (const doc of documents) {
        const result = await database.query(`
          INSERT INTO documents (title, content, owner_id, is_public)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [doc.title, doc.content, doc.owner_id, doc.is_public]);
        
        // Add collaborator to shared project
        if (doc.title === 'Shared Project' && result.rows.length > 0) {
          await database.query(`
            INSERT INTO document_collaborators (document_id, user_id, permission)
            VALUES ($1, $2, $3)
            ON CONFLICT (document_id, user_id) DO NOTHING
          `, [result.rows[0].id, johnId, 'write']);
        }
      }
    }
    
    logger.info('Database seeding completed successfully');
    logger.info('Sample users created with password: password123');
    
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}

export default seedDatabase;