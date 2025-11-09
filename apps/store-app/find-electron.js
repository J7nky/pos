#!/usr/bin/env node

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Locating Electron executable...\n');

// Possible locations for Electron executable
const possiblePaths = [
  // Local node_modules (npm)
  join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe'),
  // pnpm store (root)
  join(__dirname, '..', '..', 'node_modules', '.pnpm', 'electron@38.5.0', 'node_modules', 'electron', 'dist', 'electron.exe'),
  // pnpm store (current working directory)
  join(process.cwd(), 'node_modules', '.pnpm', 'electron@38.5.0', 'node_modules', 'electron', 'dist', 'electron.exe'),
  // Alternative pnpm location
  join(__dirname, '..', '..', 'node_modules', '.pnpm', 'electron@38.5.0', 'node_modules', 'electron', 'dist', 'electron.exe'),
];

console.log('Checking possible locations:\n');

let found = false;
for (const electronPath of possiblePaths) {
  const exists = existsSync(electronPath);
  console.log(`${exists ? '✅' : '❌'} ${electronPath}`);
  if (exists && !found) {
    found = true;
    console.log(`\n🎯 Found Electron executable at:\n   ${electronPath}\n`);
    
    // Check path.txt
    const electronDir = join(electronPath, '..', '..');
    const pathTxt = join(electronDir, 'path.txt');
    const fs = await import('fs');
    console.log(`📄 Checking path.txt: ${existsSync(pathTxt) ? '✅ Exists' : '❌ Missing'}`);
    if (existsSync(pathTxt)) {
      const content = fs.readFileSync(pathTxt, 'utf-8').trim();
      console.log(`   Content: "${content}"`);
    } else {
      console.log(`   ⚠️  path.txt is missing. Creating it...`);
      fs.writeFileSync(pathTxt, 'electron.exe', 'utf-8');
      console.log(`   ✅ Created path.txt`);
    }
  }
}

if (!found) {
  console.log('\n❌ Electron executable not found in any of the expected locations.');
  console.log('\n💡 To fix this, run:');
  console.log('   npx --yes electron-download@latest --version=38.5.0 --platform=win32 --arch=x64');
  console.log('\n   Then extract the zip to:');
  console.log('   node_modules\\.pnpm\\electron@38.5.0\\node_modules\\electron\\dist\\');
}

