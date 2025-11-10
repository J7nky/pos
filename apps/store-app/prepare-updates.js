/**
 * Script to prepare update files for upload to server
 * Copies latest.yml and installer files to public/updates/ directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
const publicUpdatesDir = path.join(__dirname, 'public', 'updates');

// Ensure public/updates directory exists
if (!fs.existsSync(publicUpdatesDir)) {
  fs.mkdirSync(publicUpdatesDir, { recursive: true });
  console.log('✅ Created public/updates directory');
}

// Read latest.yml to find the installer file name
const latestYmlPath = path.join(distDir, 'latest.yml');
if (!fs.existsSync(latestYmlPath)) {
  console.error('❌ Error: latest.yml not found in dist/ directory');
  console.error('   Please run "npm run dist" first to build the app');
  process.exit(1);
}

const latestYmlContent = fs.readFileSync(latestYmlPath, 'utf8');
const installerMatch = latestYmlContent.match(/path:\s*(.+)/);
const installerFileName = installerMatch ? installerMatch[1].trim() : null;

if (!installerFileName) {
  console.error('❌ Error: Could not find installer file name in latest.yml');
  process.exit(1);
}

// Files to copy
const filesToCopy = [
  { src: 'latest.yml', dest: 'latest.yml' },
  { src: installerFileName, dest: installerFileName }
];

console.log('📦 Preparing update files for upload...\n');

let copiedCount = 0;
for (const file of filesToCopy) {
  const srcPath = path.join(distDir, file.src);
  const destPath = path.join(publicUpdatesDir, file.dest);
  
  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️  Warning: ${file.src} not found in dist/ directory`);
    continue;
  }
  
  try {
    fs.copyFileSync(srcPath, destPath);
    const stats = fs.statSync(destPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Copied: ${file.src} → public/updates/${file.dest} (${sizeMB} MB)`);
    copiedCount++;
  } catch (error) {
    console.error(`❌ Error copying ${file.src}:`, error.message);
  }
}

console.log(`\n✨ Done! Copied ${copiedCount} file(s) to public/updates/`);
console.log('\n📤 Next steps:');
console.log('   1. Commit the files: git add public/updates/');
console.log('   2. Commit: git commit -m "Add update files"');
console.log('   3. Push: git push');
console.log('   4. Netlify will automatically deploy the files');
console.log('\n🔍 Verify after deployment:');
console.log('   - https://souq-trablous.com/updates/latest.yml');
console.log(`   - https://souq-trablous.com/updates/${encodeURIComponent(installerFileName)}`);

