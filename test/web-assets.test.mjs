import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { seed } from '../src/store.mjs';

test('relocated runtime serves local logo, design tokens and subset icons without relaxing CSP', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'my-ai-ui-assets-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  await seed(home);
  const { startWeb } = await import(pathToFileURL(path.join(home, 'runtime/src/web.mjs')));
  const web = await startWeb({ home, port: 0 });
  t.after(() => new Promise(resolve => web.server.close(resolve)));
  for (const [route, type, prefix] of [
    ['/assets/logo.png', 'image/png', [137,80,78,71]],
    ['/design-system/assets/icons/material-symbols-rounded.woff2', 'font/woff2', [119,79,70,50]],
    ['/design-system/bxy-design-tokens.css', 'text/css', null],
  ]) {
    const result = await fetch(web.origin + route);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-type'), type);
    assert.match(result.headers.get('content-security-policy'), /default-src 'self'/);
    const bytes = new Uint8Array(await result.arrayBuffer());
    if (prefix) assert.deepEqual([...bytes.slice(0,4)], prefix);
    else assert.match(new TextDecoder().decode(bytes), /--bxy-color-brand/);
  }
  assert.equal((await fetch(web.origin + '/design-system/bxy-design-tokens.json')).status, 404);
  assert.equal((await fetch(web.origin + '/api/state')).status, 403);
});
