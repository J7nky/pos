#!/usr/bin/env node

/**
 * Netlify Deployment Helper Script
 * This script helps prepare the project for Netlify deployment
 */

import fs from 'fs';
import path from 'path';

console.log('🚀 Preparing project for Netlify deployment...\n');

// Check if required files exist
const requiredFiles = [
  'netlify.toml',
  '_redirects',
  'package.json',
  'vite.config.ts'
];

console.log('📋 Checking required files...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
  }
});

// Check package.json scripts
console.log('\n📦 Checking build scripts...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (packageJson.scripts['build:netlify']) {
  console.log('✅ build:netlify script found');
} else {
  console.log('❌ build:netlify script missing');
}

if (packageJson.scripts['build:production']) {
  console.log('✅ build:production script found');
} else {
  console.log('❌ build:production script missing');
}

// Check for Vercel files (should be removed)
console.log('\n🧹 Checking for Vercel files to remove...');
const vercelFiles = ['vercel.json', '.vercel'];

vercelFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`⚠️  ${file} still exists - should be removed`);
  } else {
    console.log(`✅ ${file} removed`);
  }
});

// Environment variables check
console.log('\n🔧 Environment variables needed for Netlify:');
console.log('   VITE_PUBLIC_URL=https://your-site-name.netlify.app');
console.log('   VITE_SUPABASE_URL=your_supabase_url');
console.log('   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key');
console.log('   NODE_ENV=production');

console.log('\n📚 Next steps:');
console.log('1. Push your code to GitHub/GitLab/Bitbucket');
console.log('2. Go to netlify.com and create a new site from Git');
console.log('3. Set the build command to: npm run build:netlify');
console.log('4. Set the publish directory to: dist');
console.log('5. Add the environment variables listed above');
console.log('6. Deploy!');

console.log('\n✨ Netlify setup complete!');
