#!/usr/bin/env node

// CLI test script for user synchronization
import { userSync } from './sync-cli';

async function main() {
  const command = process.argv[2] || 'stats';
  const password = process.argv[3] || 'P@$$w0rd1!';
  try {
    switch (command) {
      case 'stats':
        const stats = await userSync.stats();
        stats.details.forEach(detail =>);
        break;

      case 'dry-run':
        const dryResult = await userSync.dryRun();
        break;

      case 'sync':
        const syncResult = await userSync.sync();
        break;

      case 'password-dry-run':
        const passDryResult = await userSync.setPasswordsDryRun(password);
        break;

      case 'set-passwords':
        const passResult = await userSync.setPasswords(password);
        break;

      case 'full-sync':
        const fullResult = await userSync.fullSync(password);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
