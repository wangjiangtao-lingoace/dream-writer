#!/usr/bin/env node

// Ensure Prisma client is generated for development
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const prismaDir = path.join(__dirname, '..', 'prisma');
const clientPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');

// Check if Prisma client exists
if (!fs.existsSync(clientPath)) {
  console.log('Prisma client not found, generating...');
  try {
    execSync('npx prisma generate', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('✅ Prisma client generated successfully');
  } catch (error) {
    console.error('❌ Failed to generate Prisma client:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Prisma client already exists');
}
