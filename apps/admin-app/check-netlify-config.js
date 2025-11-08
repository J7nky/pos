#!/usr/bin/env node

/**
 * Diagnostic script to check which netlify.toml would be used
 * and verify the build configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Netlify Configuration Diagnostic\n');
console.log('=' .repeat(60));

// Check current directory
const currentDir = process.cwd();
console.log(`\n📁 Current Directory: ${currentDir}`);

// Check if we're in admin-app
const isInAdminApp = currentDir.includes('admin-app');
console.log(`📍 In admin-app directory: ${isInAdminApp ? '✅ YES' : '❌ NO'}`);

// Check for netlify.toml files
const rootNetlifyToml = path.join(currentDir, '..', '..', 'netlify.toml');
const adminNetlifyToml = path.join(currentDir, 'netlify.toml');
const rootExists = fs.existsSync(rootNetlifyToml);
const adminExists = fs.existsSync(adminNetlifyToml);

console.log(`\n📄 Netlify.toml Files:`);
console.log(`   Root netlify.toml: ${rootExists ? '✅ EXISTS' : '❌ NOT FOUND'} (${rootNetlifyToml})`);
console.log(`   Admin netlify.toml: ${adminExists ? '✅ EXISTS' : '❌ NOT FOUND'} (${adminNetlifyToml})`);

// Read and compare configs
if (rootExists) {
  console.log(`\n📋 Root netlify.toml content:`);
  const rootContent = fs.readFileSync(rootNetlifyToml, 'utf8');
  const rootPublish = rootContent.match(/publish\s*=\s*["']?([^"'\n]+)/i);
  const rootCommand = rootContent.match(/command\s*=\s*["']?([^"'\n]+)/i);
  console.log(`   Publish: ${rootPublish ? rootPublish[1] : 'not found'}`);
  console.log(`   Command: ${rootCommand ? rootCommand[1].substring(0, 80) + '...' : 'not found'}`);
  
  if (rootCommand && rootCommand[1].includes('store-app')) {
    console.log(`   ⚠️  WARNING: Root config builds store-app!`);
  }
}

if (adminExists) {
  console.log(`\n📋 Admin netlify.toml content:`);
  const adminContent = fs.readFileSync(adminNetlifyToml, 'utf8');
  const adminPublish = adminContent.match(/publish\s*=\s*["']?([^"'\n]+)/i);
  const adminCommand = adminContent.match(/command\s*=\s*["']?([^"'\n]+)/i);
  console.log(`   Publish: ${adminPublish ? adminPublish[1] : 'not found'}`);
  console.log(`   Command: ${adminCommand ? adminCommand[1].substring(0, 80) + '...' : 'not found'}`);
  
  if (adminCommand && adminCommand[1].includes('admin-app')) {
    console.log(`   ✅ Admin config builds admin-app!`);
  }
}

// Check dist folder
const distPath = path.join(currentDir, 'dist');
const distExists = fs.existsSync(distPath);
console.log(`\n📦 Build Output:`);
console.log(`   dist folder exists: ${distExists ? '✅ YES' : '❌ NO'}`);

if (distExists) {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const hasAdmin = indexContent.includes('Admin Dashboard');
    const hasStore = indexContent.includes('store') || indexContent.includes('POS');
    console.log(`   index.html contains 'Admin Dashboard': ${hasAdmin ? '✅ YES' : '❌ NO'}`);
    if (hasStore && !hasAdmin) {
      console.log(`   ⚠️  WARNING: index.html might be from store-app!`);
    }
  }
}

// Netlify behavior simulation
console.log(`\n🎯 Netlify Behavior Simulation:`);
if (isInAdminApp && adminExists) {
  console.log(`   ✅ Netlify SHOULD use: apps/admin-app/netlify.toml`);
  console.log(`   ✅ This will build: admin-app`);
} else if (rootExists) {
  console.log(`   ⚠️  Netlify WILL use: root netlify.toml`);
  console.log(`   ⚠️  This will build: store-app (WRONG!)`);
  console.log(`   ❌ Base directory might not be set correctly in Netlify dashboard!`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`\n💡 Recommendation:`);
console.log(`   In Netlify Dashboard → Site Settings → Build & Deploy:`);
console.log(`   - Base directory MUST be: apps/admin-app`);
console.log(`   - Publish directory: dist (or leave empty to use netlify.toml)`);
console.log(`   - Build command: (leave empty to use netlify.toml)`);

