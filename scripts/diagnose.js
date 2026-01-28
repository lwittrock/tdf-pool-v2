#!/usr/bin/env node

/**
 * Diagnostic Script
 * 
 * Checks if your TdF Pool project is set up correctly
 * Run: node scripts/diagnose.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const log = {
  success: (msg) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  error: (msg) => console.log(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  warn: (msg) => console.log(`${COLORS.yellow}!${COLORS.reset} ${msg}`),
  info: (msg) => console.log(`${COLORS.blue}ℹ${COLORS.reset} ${msg}`),
  header: (msg) => console.log(`\n${COLORS.blue}${msg}${COLORS.reset}\n`),
};

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function checkFile(filepath, description) {
  const exists = await fileExists(filepath);
  if (exists) {
    log.success(`${description} exists`);
    return true;
  } else {
    log.error(`${description} NOT FOUND`);
    return false;
  }
}

async function checkJsonFile(filepath, description) {
  const exists = await checkFile(filepath, description);
  if (!exists) return false;
  
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    JSON.parse(content);
    log.success(`${description} is valid JSON`);
    return true;
  } catch (error) {
    log.error(`${description} is INVALID JSON: ${error.message}`);
    return false;
  }
}

async function diagnose() {
  console.log('\n🔍 TdF Pool Diagnostic Tool\n');
  
  let issuesFound = 0;
  
  // Check 1: Critical Files
  log.header('1. Checking Critical Configuration Files');
  
  const criticalFiles = [
    [path.join(ROOT, 'lib/config.ts'), 'lib/config.ts'],
    [path.join(ROOT, 'lib/constants.ts'), 'lib/constants.ts'],
    [path.join(ROOT, 'lib/api-utils.ts'), 'lib/api-utils.ts'],
    [path.join(ROOT, 'vite.config.ts'), 'vite.config.ts'],
    [path.join(ROOT, 'package.json'), 'package.json'],
  ];
  
  for (const [filepath, desc] of criticalFiles) {
    const exists = await checkFile(filepath, desc);
    if (!exists) issuesFound++;
  }
  
  // Check 2: Public Directory Structure
  log.header('2. Checking Public Directory');
  
  const publicDirs = [
    [path.join(ROOT, 'public'), 'public/'],
    [path.join(ROOT, 'public/data'), 'public/data/'],
    [path.join(ROOT, 'public/assets'), 'public/assets/'],
  ];
  
  for (const [dirpath, desc] of publicDirs) {
    const exists = await fileExists(dirpath);
    if (exists) {
      log.success(`${desc} directory exists`);
    } else {
      log.error(`${desc} directory NOT FOUND`);
      log.info(`  Create it with: mkdir -p ${dirpath}`);
      issuesFound++;
    }
  }
  
  // Check 3: Data Files
  log.header('3. Checking JSON Data Files');
  
  const dataFiles = [
    'metadata.json',
    'riders.json',
    'stages_data.json',
    'team_selections.json',
    'leaderboards.json',
    'rider_rankings.json',
  ];
  
  for (const filename of dataFiles) {
    const filepath = path.join(ROOT, 'public/data', filename);
    const valid = await checkJsonFile(filepath, `public/data/${filename}`);
    if (!valid) issuesFound++;
  }
  
  // Check 4: Assets
  log.header('4. Checking Jersey SVG Assets');
  
  const assets = [
    'jersey_yellow.svg',
    'jersey_green.svg',
    'jersey_polka_dot.svg',
    'jersey_white.svg',
  ];
  
  for (const filename of assets) {
    const filepath = path.join(ROOT, 'public/assets', filename);
    const exists = await checkFile(filepath, `public/assets/${filename}`);
    if (!exists) issuesFound++;
  }
  
  // Check 5: Environment Variables
  log.header('5. Checking Environment Variables');
  
  const envVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BLOB_READ_WRITE_TOKEN',
  ];
  
  let envFile;
  try {
    envFile = await fs.readFile(path.join(ROOT, '.env'), 'utf-8');
  } catch {
    log.warn('.env file not found (okay if using system env vars)');
  }
  
  for (const varName of envVars) {
    const hasEnv = process.env[varName] || (envFile && envFile.includes(varName));
    if (hasEnv) {
      log.success(`${varName} is set`);
    } else {
      log.warn(`${varName} NOT SET (required for production)`);
    }
  }
  
  // Check 6: Vite Config
  log.header('6. Checking Vite Configuration');
  
  try {
    const viteConfig = await fs.readFile(path.join(ROOT, 'vite.config.ts'), 'utf-8');
    
    if (viteConfig.includes("base: '/tdf-pool-v2/'")) {
      log.success("Base path is set to '/tdf-pool-v2/'");
    } else if (viteConfig.includes("base:")) {
      log.warn("Base path is set but might be incorrect");
      log.info("  Check vite.config.ts - should be: base: '/tdf-pool-v2/'");
    } else {
      log.error("Base path NOT SET in vite.config.ts");
      issuesFound++;
    }
  } catch {
    log.error('Could not read vite.config.ts');
    issuesFound++;
  }
  
  // Summary
  log.header('Diagnostic Summary');
  
  if (issuesFound === 0) {
    console.log(`${COLORS.green}✅ All checks passed! Your project is configured correctly.${COLORS.reset}\n`);
    console.log('Next steps:');
    console.log('  1. Run: npm install');
    console.log('  2. Run: npm run dev');
    console.log('  3. Visit: http://localhost:5173\n');
  } else {
    console.log(`${COLORS.yellow}⚠️  Found ${issuesFound} issue(s) that need attention.${COLORS.reset}\n`);
    console.log('Quick fixes:');
    console.log('  1. Create missing directories:');
    console.log('     mkdir -p public/data public/assets');
    console.log('  2. Copy your JSON files to public/data/');
    console.log('  3. Copy jersey SVGs to public/assets/');
    console.log('  4. Set environment variables in .env\n');
    console.log('See DEPLOYMENT_GUIDE.md for detailed instructions.\n');
  }
  
  // Additional Info
  log.header('Additional Information');
  
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'));
    log.info(`Project: ${pkg.name} v${pkg.version}`);
    
    // Check if new scripts are available
    if (pkg.scripts['deploy:data:download']) {
      log.success('Data management scripts are installed');
      console.log('\n  Available commands:');
      console.log('    npm run deploy:data:download  - Download JSON from Vercel Blob');
      console.log('    npm run deploy:data:upload    - Upload JSON to Vercel Blob');
      console.log('    npm run deploy:data:list      - List files in Blob');
      console.log('    npm run deploy:data:sync      - Download and build\n');
    } else {
      log.warn('Data management scripts not found in package.json');
      log.info('  Update package.json with the new version');
    }
  } catch {
    // Ignore
  }
}

diagnose().catch(error => {
  console.error(`\n${COLORS.red}Fatal error during diagnostic:${COLORS.reset}`, error);
  process.exit(1);
});
