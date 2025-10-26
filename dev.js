#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting POS Development Environment...\n');

// Set NODE_ENV to development
process.env.NODE_ENV = 'development';

// Start Vite dev server
console.log('📦 Starting Vite dev server...');
const vite = spawn('npm', ['run', 'vite:dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});

// Start Electron with hot reloading
console.log('⚡ Starting Electron with hot reloading...');
const electron = spawn('npm', ['run', 'dev:electron'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down development environment...');
  vite.kill('SIGINT');
  electron.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down development environment...');
  vite.kill('SIGTERM');
  electron.kill('SIGTERM');
  process.exit(0);
});

// Handle child process errors
vite.on('error', (err) => {
  console.error('❌ Vite error:', err);
});

electron.on('error', (err) => {
  console.error('❌ Electron error:', err);
});

vite.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Vite exited with code ${code}`);
    electron.kill();
  }
});

electron.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Electron exited with code ${code}`);
    vite.kill();
  }
});







