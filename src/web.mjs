import http from 'node:http';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { allAssets, catalog, config, defaultConfig, PACKAGE, saveAsset, seed, TOOLS } from './store.mjs';
import { json, locked, read, readJSON, write } from './fs.mjs';
import { apply, doctor, plan, projectConfig, projectRoot, publicPlan } from './project.mjs';
import { agentCatalog } from './agents.mjs';
import { pathInspector } from './conflicts.mjs';
import { bindMemoryProject, readMemory, recallMemory, saveMemory, putMemory, deleteMemory, renderMemory } from './memory.mjs';

export async function startWeb({ home, project, port = 4317 }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  if (project) project = await projectRoot(project);
  const token = randomBytes(24).toString('hex');
  let origin;
  const server = http.createServer(async (req, res) => {
    function send(status, value, type = 'application/json; charset=utf-8') {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
      res.end(type.startsWith('application/json') ? json(value) : value);
    }
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403, { error: 'Invalid origin' });
      const url = new URL(req.url, origin);
      if (!url.pathname.startsWith('/api/')) {
        const asset = {
          '/': ['web/index.html', 'text/html; charset=utf-8'],
          '/app.js': ['web/app.js', 'text/javascript'],
          '/style.css': ['web/style.css', 'text/css'],
          '/design-system/bxy-design-tokens.css': ['design-system/bxy-design-tokens.css', 'text/css'],
          '/design-system/assets/icons/material-symbols-rounded.css': ['design-system/assets/icons/material-symbols-rounded.css', 'text/css'],
          '/design-system/assets/icons/material-symbols-rounded.woff2': ['design-system/assets/icons/material-symbols-rounded.woff2', 'font/woff2'],
          '/assets/logo.png': ['web/assets/logo.png', 'image/png'],
        }[url.pathname];
        if (!asset || req.method !== 'GET') return send(404, { error: 'Not found' });
        return send(200, await fs.readFile(path.join(PACKAGE, asset[0])), asset[1]);
      }
      if (req.headers['x-my-ai-token'] !== token) return send(403, { error: '请使用终端中带访问凭证的本地链接打开' });
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const selected = url.searchParams.get('project') || project;
        const root = selected ? await projectRoot(selected) : null;
        const raw = root ? await pathInspector(root).inspect('.my-ai-infra.json') : null;
        return send(200, { home, tools: TOOLS, projects: await readJSON(home, 'projects.json', []), assets: await catalog(home), inventory: await allAssets(home), agents: (await agentCatalog(home)).map(({ body, content, ...item }) => item), defaults: await config(await readJSON(home, 'defaults.json', defaultConfig()), home, { allowEmpty: true, allowProjectId: false }), project: root, config: root ? await projectConfig(home, root, { recover: true }) : null, initialized: raw !== null });
      }
      if (req.method !== 'POST') return send(404, { error: 'Not found' });
      let size = 0, chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw Error('Request too large'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (url.pathname === '/api/memory/read') return send(200, await readMemory(home, body));
      if (url.pathname === '/api/memory/recall') return send(200, await recallMemory(home, body));
      if (url.pathname === '/api/memory/save') return send(200, await saveMemory(home, body, body.content, body.revision));
      if (url.pathname === '/api/memory/bind') return send(200, await bindMemoryProject(home, body.project, body.projectId));
      if (url.pathname === '/api/memory/delete') return send(200, await deleteMemory(home, body, body.id, body.revision));
      if (url.pathname === '/api/memory/status') {
        if (!['approved', 'deprecated'].includes(body.status)) throw Error('无效状态');
        const current = await readMemory(home, body);
        const entry = current.entries.find(e => e.id === body.id);
        if (!entry) throw Error('未知记忆 ID');
        return send(200, await putMemory(home, body, renderMemory([{ ...entry, status: body.status, basis: body.status === 'approved' ? 'confirmed' : entry.basis, updated: new Date().toISOString().slice(0, 10) }]), body.revision));
      }
      if (url.pathname === '/api/plan') return send(200, publicPlan(await plan(home, body.project, body.config, { conflict: body.conflict || 'merge' })));
      if (url.pathname === '/api/apply') {
        if (typeof body.revision !== 'string') throw Error('请先预览安装内容');
        return send(200, await apply(home, body.project, body.config, body.revision, { conflict: body.conflict || 'merge' }));
      }
      if (url.pathname === '/api/doctor') return send(200, await doctor(home, body.project));
      if (url.pathname === '/api/asset') return send(200, await saveAsset(home, body.name, body.content, body.revision, body.type || 'skills'));
      if (url.pathname === '/api/defaults') {
        const chosen = await config(body.config, home, { allowProjectId: false });
        await locked(home, async () => {
          if (json(await config(await readJSON(home, 'defaults.json', defaultConfig()), home, { allowEmpty: true, allowProjectId: false })) !== json(body.previous)) throw Error('Preferences changed; reload first');
          await seed(home); await write(home, 'defaults.json', json(chosen));
        });
        return send(200, chosen);
      }
      return send(404, { error: 'Not found' });
    } catch (e) { send(400, { error: e.message }); }
  });
  server.requestTimeout = 15000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, token, origin, url: origin + '/#' + token };
}
