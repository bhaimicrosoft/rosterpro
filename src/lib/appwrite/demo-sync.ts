// Simple demo script to test user sync functionality
// You can run this in your terminal with: npx tsx src/lib/appwrite/demo-sync.ts

import { userSync } from './sync-users';

async function demo() {
  try {
    // Step 1: Show current statistics
    const stats = await userSync.stats();
    stats.details.forEach(detail =>);
    // Step 2: Run a dry run to see what would happen
    if (stats.newUsers > 0 || stats.orphanedUsers > 0) {
      const dryResult = await userSync.dryRun();
      if (dryResult.details.length > 0) {
        dryResult.details.slice(0, 5).forEach(detail =>);
        if (dryResult.details.length > 5) {
        }
      }
      // Step 3: Ask if you want to proceed with live sync
    } else {
    }

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo
demo().catch(console.error);
