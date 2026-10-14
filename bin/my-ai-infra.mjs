#!/usr/bin/env node
import { main } from '../src/cli.mjs';
import { terminalUI } from '../src/terminal.mjs';
main().catch(error => {
  const ui = terminalUI({ output: process.stderr });
  if (ui.active) ui.error(error); else console.error(error.message);
  process.exitCode = error.exitCode || 1;
});
