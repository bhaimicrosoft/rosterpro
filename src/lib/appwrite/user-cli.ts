#!/usr/bin/env node

// CLI script for user creation and management
import { userCreation } from './create-users';

async function main() {
  const command = process.argv[2] || 'preview';
  try {
    switch (command) {
      case 'preview':
        userCreation.preview();
        break;

      case 'clear-dry-run':
        await userCreation.clearDryRun();
        break;

      case 'clear':
        await userCreation.clear();
        break;

      case 'create-dry-run':
        const createDryResult = await userCreation.createDryRun();
        break;

      case 'create':
        const createResult = await userCreation.create();
        if (createResult.success) {
        }
        break;

      case 'full-reset-dry-run':
        const fullDryResult = await userCreation.fullReset(true);
        break;

      case 'full-reset':
        const fullResult = await userCreation.fullReset(false);
        if (fullResult.success) {
        }
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
