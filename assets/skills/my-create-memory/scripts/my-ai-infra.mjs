#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const args = process.argv.slice(2);
  let explicitHome;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--home=')) {
      explicitHome = args[i].slice('--home='.length);
      if (!explicitHome) throw Error('Missing value for --home');
      continue;
    }
    if (args[i] !== '--home') continue;
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error('Missing value for --home');
    explicitHome = value;
  }
  const home = path.resolve(explicitHome || process.env.MY_AI_INFRA_HOME || path.join(os.homedir(), '.my-ai-infra'));
  const runtime = path.join(home, 'runtime/src/cli.mjs');
  try { await fs.access(runtime); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw Error(`尚未安装本地 runtime：${runtime}。请从 my-ai-infra 安装包对该个人库执行 setup。`);
  }
  const { main } = await import(pathToFileURL(runtime));
  await main(args);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
