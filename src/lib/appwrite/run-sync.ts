#!/usr/bin/env node

// Usage script for user synchronization
// Run this script to sync users from Appwrite Auth to Users collection

import { userSync } from './sync-users';

async function main() {
  const command = process.argv[2];
  try {
    switch (command) {
      case 'stats':
        const stats = await userSync.stats();
        stats.details.forEach(detail =>);
        break;

      case 'dry-run':
        const dryResult = await userSync.dryRun();
        if (dryResult.details.length > 0) {
          dryResult.details.forEach(detail =>);
        }
        break;

      case 'sync':
        const syncResult = await userSync.sync();
        if (syncResult.errors.length > 0) {
          syncResult.errors.forEach(error =>);
        }
        break;

      case 'cleanup-dry':
        const cleanupDryResult = await userSync.cleanupDryRun();
        break;

      case 'cleanup':
        const cleanupResult = await userSync.cleanup();
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
