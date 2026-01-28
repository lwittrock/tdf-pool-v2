#!/usr/bin/env node

/**
 * Deployment Helper Script
 * 
 * This script helps you manage JSON data files for both development and production.
 * 
 * Usage:
 *   npm run deploy:data          - Download JSON from Vercel Blob to local /public/data
 *   npm run deploy:data:upload   - Upload local JSON files to Vercel Blob
 *   npm run deploy:data:sync     - Download from Blob, then build and deploy
 */

import { list, put } from '@vercel/blob';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DATA_DIR = path.join(__dirname, '../public/data');
const FILES_TO_MANAGE = [
  'metadata.json',
  'leaderboards.json',
  'riders.json',
  'stages_data.json',
  'team_selections.json',
  'rider_rankings.json',
];

/**
 * Ensure public/data directory exists
 */
async function ensureDataDir() {
  try {
    await fs.access(PUBLIC_DATA_DIR);
  } catch {
    await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
    console.log('✅ Created /public/data directory');
  }
}

/**
 * Download JSON files from Vercel Blob to local /public/data
 */
async function downloadFromBlob() {
  console.log('\n📥 Downloading JSON files from Vercel Blob...\n');
  
  await ensureDataDir();
  
  let successCount = 0;
  let errorCount = 0;
  
  // First, list all blobs
  const { blobs } = await list({ prefix: 'data/' });
  
  for (const filename of FILES_TO_MANAGE) {
    try {
      const blobPath = `data/${filename}`;
      console.log(`  Downloading ${filename}...`);
      
      // Find the blob in the list
      const blob = blobs.find(b => b.pathname === blobPath);
      
      if (!blob) {
        console.log(`  ⚠️  ${filename} not found in Blob storage`);
        errorCount++;
        continue;
      }
      
      // Download using the URL
      const response = await fetch(blob.url);
      const content = await response.text();
      
      // Write to local file
      const localPath = path.join(PUBLIC_DATA_DIR, filename);
      await fs.writeFile(localPath, content, 'utf-8');
      
      console.log(`  ✅ ${filename} downloaded successfully`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed to download ${filename}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary: ${successCount} files downloaded, ${errorCount} errors\n`);
  
  if (successCount > 0) {
    console.log('✅ Files are now available in /public/data for local development');
    console.log('   Run "npm run dev" to test locally\n');
  }
}

/**
 * Upload local JSON files to Vercel Blob
 */
async function uploadToBlob() {
  console.log('\n📤 Uploading JSON files to Vercel Blob...\n');
  
  await ensureDataDir();
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const filename of FILES_TO_MANAGE) {
    try {
      const localPath = path.join(PUBLIC_DATA_DIR, filename);
      
      // Check if file exists
      try {
        await fs.access(localPath);
      } catch {
        console.log(`  ⚠️  ${filename} not found locally, skipping`);
        continue;
      }
      
      console.log(`  Uploading ${filename}...`);
      
      // Read file content
      const content = await fs.readFile(localPath, 'utf-8');
      
      // Validate JSON
      try {
        JSON.parse(content);
      } catch {
        console.log(`  ❌ ${filename} is not valid JSON, skipping`);
        errorCount++;
        continue;
      }
      
      // Upload to Blob
      const blobPath = `data/${filename}`;
      await put(blobPath, content, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
      });
      
      console.log(`  ✅ ${filename} uploaded successfully`);
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed to upload ${filename}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary: ${successCount} files uploaded, ${errorCount} errors\n`);
}

/**
 * List files in Vercel Blob
 */
async function listBlobFiles() {
  console.log('\n📋 Files in Vercel Blob:\n');
  
  try {
    const { blobs } = await list({ prefix: 'data/' });
    
    if (blobs.length === 0) {
      console.log('  No files found in Blob storage\n');
      return;
    }
    
    for (const blob of blobs) {
      const size = (blob.size / 1024).toFixed(2);
      console.log(`  📄 ${blob.pathname} (${size} KB)`);
      console.log(`     ${blob.url}\n`);
    }
  } catch (error) {
    console.error('  ❌ Failed to list files:', error.message);
  }
}

/**
 * Main CLI
 */
const command = process.argv[2];

async function main() {
  // Check for required env vars
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('\n❌ Error: BLOB_READ_WRITE_TOKEN environment variable not set');
    console.error('   Set it in your .env file or environment\n');
    process.exit(1);
  }
  
  switch (command) {
    case 'download':
      await downloadFromBlob();
      break;
      
    case 'upload':
      await uploadToBlob();
      break;
      
    case 'list':
      await listBlobFiles();
      break;
      
    case 'sync':
      await downloadFromBlob();
      console.log('🔨 Building project...\n');
      // This would typically call `npm run build`
      // but we'll leave that to package.json scripts
      break;
      
    default:
      console.log('\n📦 TdF Pool Data Management\n');
      console.log('Usage:');
      console.log('  npm run deploy:data download  - Download JSON from Vercel Blob');
      console.log('  npm run deploy:data upload    - Upload local JSON to Vercel Blob');
      console.log('  npm run deploy:data list      - List files in Vercel Blob');
      console.log('  npm run deploy:data sync      - Download and prepare for build\n');
      break;
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
