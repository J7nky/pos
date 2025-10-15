#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔧 Setting up development environment...\n');

// Set NODE_ENV to development
process.env.NODE_ENV = 'development';

// Create .env file for development
const envContent = `NODE_ENV=development
VITE_DEV_SERVER_URL=http://localhost:5175
`;

if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', envContent);
  console.log('✅ Created .env file');
} else {
  console.log('ℹ️  .env file already exists');
}

// Build Electron main process
console.log('🔨 Building Electron main process...');
try {
  execSync('npm run build:electron', { stdio: 'inherit' });
  console.log('✅ Electron main process built successfully');
} catch (error) {
  console.error('❌ Failed to build Electron main process:', error.message);
  process.exit(1);
}

console.log('\n🚀 Development environment ready!');
console.log('Run "npm run dev" to start the development server with hot reloading.');
console.log('\n📝 Development features enabled:');
console.log('  • Hot reloading for React components');
console.log('  • Hot reloading for Electron main process');
console.log('  • Automatic rebuild on file changes');
console.log('  • Development tools open by default');
