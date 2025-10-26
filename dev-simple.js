#!/usr/bin/env node

import { spawn } from 'child_process';
import { watch } from 'fs';
import path from 'path';

console.log('🚀 Starting POS Development Environment (Simple Mode)...\n');

// Set NODE_ENV to development
process.env.NODE_ENV = 'development';
process.env.VITE_DEV_SERVER_URL = 'http://localhost:5175';

let electronProcess = null;
let viteProcess = null;

// Function to start Electron
function startElectron() {
  if (electronProcess) {
    console.log('🔄 Restarting Electron...');
    electronProcess.kill();
  }
  
  console.log('⚡ Starting Electron...');
  electronProcess = spawn('npm', ['run', 'electron'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  electronProcess.on('exit', (code) => {
    if (code !== 0) {
      console.log(`❌ Electron exited with code ${code}`);
    }
  });
}

// Function to start Vite
function startVite() {
  console.log('📦 Starting Vite dev server...');
  viteProcess = spawn('npm', ['run', 'vite:dev'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  viteProcess.on('exit', (code) => {
    if (code !== 0) {
      console.log(`❌ Vite exited with code ${code}`);
    }
  });
}

// Function to rebuild Electron main process
function rebuildElectron() {
  console.log('🔨 Rebuilding Electron main process...');
  const buildProcess = spawn('npm', ['run', 'build:electron'], {
    stdio: 'inherit',
    shell: true
  });

  buildProcess.on('exit', (code) => {
    if (code === 0) {
      console.log('✅ Electron main process rebuilt successfully');
      // Restart Electron after successful build
      setTimeout(() => {
        startElectron();
      }, 1000);
    } else {
      console.log(`❌ Failed to rebuild Electron main process (code ${code})`);
    }
  });
}

// Start Vite first
startVite();

// Wait for Vite to be ready, then start Electron
setTimeout(() => {
  rebuildElectron();
}, 3000);

// Watch for changes in electron directory
console.log('👀 Watching for changes in electron/ directory...');
const electronWatcher = watch('electron', { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith('.ts')) {
    console.log(`📝 Detected change in ${filename}`);
    rebuildElectron();
  }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down development environment...');
  if (viteProcess) viteProcess.kill('SIGINT');
  if (electronProcess) electronProcess.kill('SIGINT');
  electronWatcher.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down development environment...');
  if (viteProcess) viteProcess.kill('SIGTERM');
  if (electronProcess) electronProcess.kill('SIGTERM');
  electronWatcher.close();
  process.exit(0);
});

console.log('✅ Development environment started!');
console.log('📝 Make changes to files in src/ for React hot reloading');
console.log('📝 Make changes to files in electron/ for Electron restart');
console.log('🛑 Press Ctrl+C to stop');








