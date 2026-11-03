#!/usr/bin/env node
import { main } from '../dist/index.js';
process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
main().catch((error) => {
  console.error(`ies: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
