# Real-time Database System with Authentication

A comprehensive real-time database system built with Node.js, PostgreSQL, Redis, and WebSockets. Features secure authentication, real-time data synchronization, and collaborative document editing.

## 🚀 Features

### Core Functionality
- **Real-time Data Synchronization** - Live updates across multiple clients using WebSockets
- **Secure Authentication** - JWT-based auth with refresh tokens and session management
- **Document Collaboration** - Real-time collaborative document editing
- **ACID Compliance** - PostgreSQL with proper transaction handling
- **Scalable Architecture** - Redis for caching and pub/sub messaging

### Security Features
- Password hashing with bcrypt
- JWT access and refresh tokens
- Rate limiting and request validation
- SQL injection protection
- CORS and security headers
- Activity logging and monitoring

### Real-time Features
- Live document editing with conflict resolution
- User presence indicators
- Real-time notifications
- Automatic reconnection handling
- Room-based messaging

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Load Balancer │    │   API Gateway   │
│  (Web/Mobile)   │◄──►│    (Nginx)      │◄──►│   (Express)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌─────────────────┐             │
                       │   WebSocket     │◄────────────┤
                       │   Server        │             │
                       │  (Socket.IO)    │             │
                       └─────────────────┘             │
                                                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │◄──►│   Application   │◄──►│     Redis       │
│   (Primary DB)  │    │     Server      │    │ (Cache/PubSub)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 13+
- Redis 6+
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd realtime-database-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb realtime_db
   
   # Run migrations
   npm run migrate
   
   # Seed with sample data
   npm run seed
   ```

5. **Start Redis server**
   ```bash
   redis-server
   ```

6. **Start the application**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 🗄️ Database Schema

### Core Tables

**users**
- `id` (UUID, Primary Key)
- `username` (VARCHAR, Unique)
- `email` (VARCHAR, Unique) 
- `password_hash` (VARCHAR)
- `first_name`, `last_name` (VARCHAR)
- `is_active` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMP)

**documents**
- `id` (UUID, Primary Key)
- `title` (VARCHAR)
- `content` (TEXT)
- `owner_id` (UUID, Foreign Key → users.id)
- `is_public` (BOOLEAN)
- `version` (INTEGER)
- `created_at`, `updated_at` (TIMESTAMP)

**document_collaborators**
- `id` (UUID, Primary Key)
- `document_id` (UUID, Foreign Key → documents.id)
- `user_id` (UUID, Foreign Key → users.id)
- `permission` (ENUM: 'read', 'write', 'admin')

**refresh_tokens**
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → users.id)
- `token_hash` (VARCHAR)
- `expires_at` (TIMESTAMP)
- `revoked_at` (TIMESTAMP)

## 🔐 API Endpoints

### Authentication
```
POST   /api/auth/register     - Register new user
POST   /api/auth/login        - User login
POST   /api/auth/refresh-token - Refresh access token
POST   /api/auth/logout       - User logout
GET    /api/auth/profile      - Get user profile
```

### Documents
```
GET    /api/documents         - Get user's documents
POST   /api/documents         - Create new document
GET    /api/documents/:id     - Get specific document
PUT    /api/documents/:id     - Update document
DELETE /api/documents/:id     - Delete document
POST   /api/documents/:id/collaborators - Add collaborator
GET    /api/documents/:id/collaborators - Get collaborators
```

### Health Check
```
GET    /api/health           - System health status
```

## 🔌 WebSocket Events

### Client → Server
```javascript
// Authentication and room management
socket.emit('join_document', { documentId })
socket.emit('leave_document', { documentId })

// Real-time editing
socket.emit('document_change', { documentId, changes, version })
socket.emit('cursor_position', { documentId, position })
```

### Server → Client
```javascript
// User presence
socket.on('user_joined', { userId, username })
socket.on('user_left', { userId, username })
socket.on('active_users', { users })

// Document updates
socket.on('document_created', { document, userId })
socket.on('document_updated', { document, userId })
socket.on('document_deleted', { documentId, userId })
socket.on('document_changed', { changes, version, userId, username })

// Collaboration
socket.on('collaborator_added', { documentId, collaborator, userId })
socket.on('cursor_updated', { userId, username, position })
```

## 🧪 Testing

Run the test suite:
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- auth.test.js
```

### Test Coverage
- Authentication flow (register, login, logout, token refresh)
- Document CRUD operations
- Real-time synchronization
- Error handling and edge cases
- Security validations

## 🚀 Deployment

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# Scale the application
docker-compose up -d --scale app=3
```

### Production Considerations
- Use environment-specific configurations
- Set up SSL/TLS certificates
- Configure reverse proxy (Nginx)
- Set up monitoring and logging
- Implement backup strategies
- Use connection pooling
- Set up health checks

## 📊 Monitoring

### Health Check Endpoint
```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "services": {
    "database": { "status": "healthy" },
    "redis": { "status": "healthy" }
  }
}
```

### Logging
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Structured JSON logging with Winston
- Request/response logging
- Database query logging

## 🔧 Configuration

### Environment Variables
```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=realtime_db
DB_USER=postgres
DB_PASSWORD=secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🛡️ Security Best Practices

### Implemented Security Measures
- **Password Security**: bcrypt with salt rounds
- **JWT Security**: Separate access/refresh tokens
- **Rate Limiting**: Configurable request limits
- **Input Validation**: Joi schema validation
- **SQL Injection**: Parameterized queries
- **CORS**: Configurable origin restrictions
- **Headers**: Helmet.js security headers
- **Session Management**: Redis-based sessions
- **Activity Logging**: Comprehensive audit trail

### Additional Recommendations
- Use HTTPS in production
- Implement API versioning
- Set up Web Application Firewall (WAF)
- Regular security audits
- Dependency vulnerability scanning
- Implement CSP headers
- Use secure cookie settings

## 📈 Performance Optimization

### Database Optimization
- Proper indexing on frequently queried columns
- Connection pooling with configurable limits
- Query optimization and monitoring
- Database partitioning for large datasets

### Caching Strategy
- Redis for session storage
- Query result caching
- Real-time data caching
- Cache invalidation strategies

### WebSocket Optimization
- Room-based messaging
- Connection pooling
- Message queuing
- Graceful degradation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Database Connection Issues**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -h localhost -U postgres -d realtime_db
```

**Redis Connection Issues**
```bash
# Check Redis status
redis-cli ping

# Check Redis logs
tail -f /var/log/redis/redis-server.log
```

**WebSocket Connection Issues**
- Check CORS configuration
- Verify JWT token validity
- Check firewall settings
- Monitor network connectivity

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Database query logging
DB_LOGGING=true npm run dev
```

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test files for usage examples

---

Built with ❤️ using Node.js, PostgreSQL, Redis, and Socket.IO