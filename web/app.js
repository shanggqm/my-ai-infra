const $ = id => document.getElementById(id);
const labels = { codex: 'Codex', claudecode: 'Claude Code', cursor: 'Cursor', copilot: 'GitHub Copilot' };
const groups = { sdd: 'SDD 主流程', support: '编码辅助', management: '资产管理', custom: '个人扩展' };
const token = (/^[a-f0-9]{48}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : '') || sessionStorage.getItem('my-ai-token') || '';
if (token) sessionStorage.setItem('my-ai-token', token);
history.replaceState(null, '', location.pathname);
let memoryDocument = null;
let previewRequest = 0;
let state, preview, selectedAsset, newAsset = false, draftName = 'my-skill';
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const icon = name => { const node = element('span', name, 'bxy-icon'); node.setAttribute('aria-hidden', 'true'); return node; };
function notice(text, error = false) {
  const target = $('preview-dialog').open ? $('preview-feedback') : $('message');
  target.hidden = false; target.className = (target.id === 'preview-feedback' ? 'preview-feedback ' : '') + (error ? 'error' : 'success');
  target.replaceChildren(icon(error ? 'error' : 'check_circle'), element('span', text));
}
async function api(route, data) {
  const response = await fetch('/api/' + route, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-My-Ai-Token': token }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || '请求失败'); return result;
}
async function task(button, action) {
  if (button.disabled) return;
  $('message').hidden = true;
  const children = [...button.childNodes]; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.replaceChildren(icon('progress_activity'), element('span', '处理中…'));
  try { await action(); } catch (e) { if (button.id === 'apply') invalidate(); notice(e.message, true); }
  finally { button.replaceChildren(...children); button.removeAttribute('aria-busy'); button.disabled = false; updateCount(); updateEditor(); updateDefaults(); updateMemory(); }
}
const selection = prefix => ({ version: 1, tools: [...document.querySelectorAll(`#${prefix}-tools input:checked`)].map(i => i.value), skills: [...document.querySelectorAll(`#${prefix}-skills input:checked`)].map(i => i.value) });
const same = (a, b) => JSON.stringify({tools:[...a.tools].sort(),skills:[...a.skills].sort()}) === JSON.stringify({tools:[...b.tools].sort(),skills:[...b.skills].sort()});
const editorDirty = () => newAsset || Boolean(selectedAsset && $('asset-content').value !== selectedAsset.content);
const projectSelectionDirty = () => state && !same(selection('project'), state.config || state.defaults);
function updateCount() {
  if (!state) return;
  const c = selection('project'), valid = c.tools.length && c.skills.length;
  const agents = (state.agents || []).filter(agent => agent.skills.every(skill => c.skills.includes(skill)));
  const extensions = (state.inventory || []).filter(asset=>asset.targets && c.tools.some(tool=>asset.targets[tool]));
  $('selection-count').textContent = valid ? `${c.tools.length} 个工具，${c.skills.length} 个 Skill${agents.length ? `，${agents.length} 个关联 Agent` : ''}${extensions.length ? `，${extensions.length} 个扩展资产` : ''}` : '请至少选择一个工具和一个 Skill';
  $('preview').disabled = !valid || $('preview').getAttribute('aria-busy') === 'true';
  $('apply').disabled = !preview || preview.actions.some(a => a.action === 'conflict') || $('apply').getAttribute('aria-busy') === 'true';
}
function invalidate() { preview = null; previewRequest++; $('preview-feedback').removeAttribute('aria-busy'); $('plan').hidden = true; updateCount(); }
function updateDefaults() {
  if (!state) return;
  const c = selection('default'), dirty = !same(c, state.defaults), valid = c.tools.length && c.skills.length;
  $('default-status').textContent = !valid ? '请至少选择一个工具和一个 Skill' : dirty ? '有尚未保存的偏好' : '偏好已保存';
  $('save-defaults').disabled = !dirty || !valid || $('save-defaults').getAttribute('aria-busy') === 'true';
}
function choices(prefix, config) {
  const tools = $(prefix + '-tools'); tools.replaceChildren();
  for (const [id, location] of Object.entries(state.tools)) {
    const label = element('label', undefined, 'tool-card'), input = element('input'); input.type = 'checkbox'; input.value = id; input.checked = config.tools.includes(id); input.setAttribute('aria-label', labels[id]);
    const title = element('div', labels[id], 'tool-title'); title.append(element('small', location)); label.append(input, title); tools.append(label);
  }
  const skills = $(prefix + '-skills'); skills.replaceChildren();
  for (const [category, title] of Object.entries(groups)) {
    const assets = state.assets.filter(a => (a.category || 'custom') === category); if (!assets.length) continue;
    const section = element('div', undefined, 'skill-group'), items = element('div', undefined, 'skill-group-items'); section.append(element('h3', title), items);
    for (const asset of assets) {
      const label = element('label', undefined, 'skill-card'), input = element('input'); input.type = 'checkbox'; input.value = asset.name; input.checked = config.skills.includes(asset.name); input.setAttribute('aria-label', asset.name + ' ' + asset.label);
      const body = element('div'); body.append(element('strong', asset.label || asset.name), element('code', asset.name)); label.append(input, body); items.append(label);
    }
    skills.append(section);
  }
  tools.onchange = skills.onchange = prefix === 'project' ? invalidate : updateDefaults;
}
async function mayDiscard(dirty) {
  if (!dirty) return true;
  const dialog = $('discard-dialog'); dialog.showModal(); $('keep-editing').focus();
  return new Promise(resolve => {
    const finish = answer => { dialog.close(); $('keep-editing').onclick = $('discard-changes').onclick = dialog.oncancel = null; resolve(answer); };
    $('keep-editing').onclick = () => finish(false); $('discard-changes').onclick = () => finish(true); dialog.oncancel = event => { event.preventDefault(); finish(false); };
  });
}
async function load(project) {
  const editorWasDirty = editorDirty();
  const preferencesDraft = state && !same(selection('default'), state.defaults) ? selection('default') : null;
  const preferencesBaseline = state?.defaults;
  const next = await api('state' + (project ? '?project=' + encodeURIComponent(project) : ''));
  $('message').hidden = true;
  const projectChanged = state?.project !== next.project;
  if (projectChanged && memoryDirty() && !await mayDiscard(true)) return;
  const projectChoice = next.config || next.defaults; state = next;
  if (projectChanged) { memoryDocument = null; $('memory-content').value = ''; $('memory-content').disabled = true; $('memory-entries').replaceChildren(); $('memory-result').textContent = '重新读取记忆后预览。'; updateMemory(); }
  if (preferencesDraft) state.defaults = preferencesBaseline;
  $('home').textContent = state.home; $('home').title = state.home;
  $('project-path').value = state.project || ''; $('project-path').removeAttribute('aria-invalid');
  $('project-status').textContent = state.project ? (state.initialized ? '已初始化。调整配置后，先预览再同步。' : '尚未初始化。应用时将创建工具配置与 SDD 需求模板。') : '输入一个已存在的本机项目目录。';
  choices('project', projectChoice); choices('default', preferencesDraft || state.defaults); invalidate(); updateDefaults(); renderAssets();
  if (selectedAsset && !editorWasDirty) { const current = state.inventory.find(a => a.name === selectedAsset.name && a.type === selectedAsset.type); if (current) editAsset(current); }
  $('projects').replaceChildren();
  for (const project of state.projects.slice().reverse()) {
    const button = element('button', project.path.split(/[\\/]/).pop()); button.title = project.path; button.append(element('small', project.path));
    button.onclick = () => task(button, async () => { if (await mayDiscard(projectSelectionDirty())) { await load(project.path); tab('project'); } }); $('projects').append(button);
  }
  if (!state.projects.length) $('projects').append(element('p', '初始化后的项目会显示在这里。', 'hint'));
}
function tab(name) {
  document.body.dataset.view = name;
  for (const id of ['home', 'project', 'assets', 'memory', 'preferences']) $(id + '-view').hidden = id !== name;
  for (const button of document.querySelectorAll('[data-tab]')) { const active = button.dataset.tab === name; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
  $('breadcrumb').textContent = { home: '首页', project: '项目配置', assets: 'AI 资产', preferences: '默认偏好', memory: '个人记忆' }[name];
}
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => { tab(button.dataset.tab); if (button.dataset.tab === 'memory' && !memoryDocument) $('memory-load').click(); };
$('load').onclick = () => task($('load'), async () => {
  if (!await mayDiscard(projectSelectionDirty())) return;
  try { await load($('project-path').value.trim()); } catch (e) { $('project-path').setAttribute('aria-invalid', 'true'); $('project-status').textContent = '无法打开项目，请检查目录是否存在且可读取。'; throw e; }
});
$('project-path').oninput = () => { $('project-path').removeAttribute('aria-invalid'); invalidate(); };
$('project-path').onkeydown = event => { if (event.key === 'Enter') $('load').click(); };
$('select-core').onclick = () => { const ids = new Set(state.assets.filter(a => a.core).map(a => a.name)); for (const input of document.querySelectorAll('#project-skills input')) input.checked = ids.has(input.value); invalidate(); };
$('conflict-policy').onchange = () => { invalidate(); notice('处理策略已更改，请重新预览后应用。'); };
$('replay-assembly').onclick = () => { for (const animation of document.querySelector('.assembly-scene').getAnimations({ subtree: true })) { animation.currentTime = 0; animation.play(); } };
function initializationHints(steps) {
  const section = element('div');
  if (steps.length) section.append(element('h3', '补全项目运行规则'));
  for (const step of steps) {
    const row = element('div'); row.append(element('strong', `${labels[step.tool]} · ${step.file}`), element('p', step.message, 'hint')); section.append(row);
  }
  return section;
}
const actionNames = { create: '新增', update: '更新', remove: '移除', noop: '无需变更', preserve: '保留', conflict: '冲突' };
function renderPlan(result, applied = false) {
  const plan = $('plan'); plan.replaceChildren(); plan.hidden = false;
  const summary = element('div', undefined, 'plan-summary');
  for (const action of ['create', 'update', 'remove', 'conflict', 'preserve', 'noop']) {
    const count = result.summary[action] || 0;
    if (!count) continue;
    const item = element('div', undefined, 'summary-item ' + action);
    item.append(element('strong', String(count)), element('span', actionNames[action])); summary.append(item);
  }
  plan.append(summary);
  const filters = element('div', undefined, 'plan-filters');
  const searchLabel = element('label', undefined, 'search-field');
  searchLabel.append(element('span', '搜索文件路径', 'sr-only'), icon('search'));
  const search = element('input'); search.type = 'search'; search.placeholder = '搜索文件路径'; searchLabel.append(search);
  const filterLabel = element('label', '显示范围', 'plan-filter-label');
  const filter = element('select');
  for (const [value, text] of [['changes','待变更与需关注'],['all','全部文件'],...Object.entries(actionNames)]) {
    const option = element('option', text); option.value = value; filter.append(option);
  }
  filterLabel.append(filter);
  const count = element('span', undefined, 'hint'); count.setAttribute('aria-live', 'polite');
  filters.append(searchLabel, filterLabel, count); plan.append(filters);
  const list = element('div', undefined, 'plan-files'); list.setAttribute('role', 'list'); list.setAttribute('aria-label', '文件变更'); plan.append(list);
  const renderFiles = () => {
    list.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const actions = result.actions.filter(a => (filter.value === 'all' || (filter.value === 'changes' ? !['noop','preserve'].includes(a.action) || a.resolution : a.action === filter.value)) && [a.path, a.target, a.reason, a.note].filter(Boolean).join(' ').toLowerCase().includes(query));
    count.textContent = `${actions.length} 个文件`;
    for (const action of actions) {
      const row = element('div', undefined, 'plan-row ' + action.action); row.setAttribute('role', 'listitem');
      const status = element('span', actionNames[action.action] || action.action, 'file-status');
      const content = element('div', undefined, 'file-content'); content.append(element('code', action.path, 'file-path'));
      const resolution = { merge: '保留本地并保存候选', replace: '备份后替换', skip: '保留并跳过' }[action.resolution];
      if (resolution) content.append(element('span', resolution, 'file-resolution'));
      if (action.reason || action.note) content.append(element('p', action.reason || action.note, 'file-note'));
      if (action.target) { const detail = element('details'); detail.append(element('summary', '查看链接目标'), element('code', action.target)); content.append(detail); }
      row.append(status, content); list.append(row);
    }
    if (!actions.length) list.append(element('p', query ? '没有匹配的文件，试试其他关键词。' : filter.value === 'changes' ? '当前没有待变更文件，可切换到“全部文件”查看。' : '此类型没有文件。', 'plan-empty'));
  };
  search.oninput = filter.onchange = renderFiles; renderFiles();
  if (result.nextSteps?.length) {
    const hints = element('details', undefined, 'initialization-hints'); hints.open = applied;
    hints.append(element('summary', applied ? '下一步：补全项目运行规则' : '应用后的项目初始化提示'), initializationHints(result.nextSteps)); plan.append(hints);
  }
  if (applied && result.recovery) plan.append(element('p', '恢复记录：' + result.recovery, 'recovery-location'));
}
async function requestPreview() {
  invalidate();
  const request = previewRequest;
  $('preview-dialog-title').textContent = '变更预览';
  $('preview-project').textContent = $('project-path').value.trim();
  $('preview-controls').hidden = false; $('apply').hidden = false;
  $('cancel-preview').textContent = '返回调整';
  $('preview-footer-note').textContent = '确认变更后，将配置应用到项目。';
  if (!$('preview-dialog').open) $('preview-dialog').showModal();
  $('preview-feedback').hidden = false; $('preview-feedback').className = 'preview-feedback';
  $('preview-feedback').replaceChildren(icon('progress_activity'), element('span', '正在检查文件与冲突…'));
  $('preview-feedback').setAttribute('aria-busy', 'true');
  try {
    const result = await api('plan', { project: $('project-path').value.trim(), config: selection('project'), conflict: $('conflict-policy').value });
    if (request !== previewRequest || !$('preview-dialog').open) return;
    preview = result; renderPlan(result); $('preview-feedback').hidden = true;
    $('preview-footer-note').textContent = result.complete ? '应用前会备份已有内容。' : '部分路径将被保留并跳过，请核对后应用。';
    if (result.actions.some(a => a.action === 'conflict')) notice('存在未解决的冲突，请调整处理策略并重新预览。', true);
    else if (result.skipped.length) notice('部分路径无法安全处理，将保留并跳过。请查看对应文件详情。', true);
    else if (result.review.length) notice('冲突将按所选策略处理，原内容与候选会保存到恢复目录。');
    updateCount();
  } finally { if (request === previewRequest) $('preview-feedback').removeAttribute('aria-busy'); }
}
$('preview').onclick = () => task($('preview'), requestPreview);
$('refresh-preview').onclick = () => task($('refresh-preview'), requestPreview);
const applying = () => $('apply').getAttribute('aria-busy') === 'true';
function closePreview() { if (!applying()) $('preview-dialog').close(); }
$('close-preview').onclick = $('cancel-preview').onclick = closePreview;
$('preview-dialog').addEventListener('cancel', event => { if (applying()) event.preventDefault(); });
$('preview-dialog').addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(node => node.getClientRects().length && node.tabIndex >= 0);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
$('preview-dialog').addEventListener('click', event => { if (event.target === $('preview-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePreview(); } });
$('preview-dialog').addEventListener('close', () => { previewRequest++; $('preview-feedback').removeAttribute('aria-busy'); $('preview').focus(); });
$('apply').onclick = () => task($('apply'), async () => {
  const current = preview;
  if (!current) return;
  for (const id of ['close-preview', 'cancel-preview', 'refresh-preview', 'conflict-policy']) $(id).disabled = true;
  try {
    const result = await api('apply', { project: current.root, config: current.config, revision: current.revision, conflict: current.conflict });
    await load(result.root); renderPlan(result, true);
    $('preview-dialog-title').textContent = result.complete ? '项目配置已应用' : '项目配置部分完成';
    $('preview-controls').hidden = true; $('apply').hidden = true;
    $('cancel-preview').textContent = '完成';
    $('preview-footer-note').textContent = '关闭窗口即可继续配置项目。';
    notice(result.complete ? '配置已保存。你可以查看变更结果与后续操作。' : '已应用可安全处理的配置；跳过路径与恢复记录见下方。', !result.complete);
  } finally { for (const id of ['close-preview', 'cancel-preview', 'refresh-preview', 'conflict-policy']) $(id).disabled = false; }
});
$('doctor').onclick = () => task($('doctor'), async () => {
  const result = await api('doctor', { project: $('project-path').value.trim() });
  notice(result.healthy ? '当前安装与配置一致。' : '需要处理：' + result.issues.map(i => typeof i === 'string' ? i : `${i.path}（${i.action}）`).join('；'), !result.healthy);
});
function renderAssets() {
  $('asset-count').textContent = state.inventory.length; $('assets-list').replaceChildren();
  for (const asset of state.inventory) {
    const button = element('button', asset.label || asset.name, 'asset-item'); button.dataset.name = asset.type + '/' + asset.name; button.append(element('small', asset.type + '/' + asset.name)); button.setAttribute('aria-label', asset.type + ' ' + asset.name + ' ' + (asset.label || asset.description));
    if (selectedAsset?.name === asset.name && selectedAsset?.type === asset.type && !newAsset) { button.classList.add('selected'); button.setAttribute('aria-current', 'true'); }
    button.onclick = async () => { if (selectedAsset?.name === asset.name && selectedAsset?.type === asset.type && !newAsset) return; if (await mayDiscard(editorDirty())) editAsset(asset); }; $('assets-list').append(button);
  }
  searchAssets();
}
function searchAssets() {
  const query = $('asset-search').value.trim().toLowerCase(); let visible = 0;
  for (const button of document.querySelectorAll('.asset-item')) { button.hidden = !button.textContent.toLowerCase().includes(query); if (!button.hidden) visible++; }
  $('search-empty').hidden = visible > 0;
}
$('asset-search').oninput = searchAssets;
function updateEditor() {
  const dirty = editorDirty(), available = newAsset || Boolean(selectedAsset);
  $('editor-status').textContent = !available ? '未选择' : dirty ? '未保存' : '已保存';
  $('save-asset').disabled = !dirty || $('save-asset').getAttribute('aria-busy') === 'true';
}
function editAsset(asset) {
  selectedAsset = asset; newAsset = false; $('asset-name').value = asset.name; $('asset-name').readOnly = true; $('asset-content').disabled = false; $('asset-content').value = asset.content; $('editor-title').textContent = asset.label || asset.name; clearEditorError();
  for (const button of document.querySelectorAll('.asset-item')) { const active = button.dataset.name === asset.type + '/' + asset.name; button.classList.toggle('selected', active); if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); } updateEditor();
}
function clearEditorError() { $('editor-error').hidden = true; $('asset-name').removeAttribute('aria-invalid'); $('asset-content').removeAttribute('aria-invalid'); }
$('new-asset').onclick = async () => {
  if (!await mayDiscard(editorDirty())) return;
  selectedAsset = null; newAsset = true; draftName = 'my-skill'; $('asset-name').value = ''; $('asset-name').readOnly = false; $('asset-content').disabled = false; $('editor-title').textContent = '新建 Skill';
  $('asset-content').value = '---\nname: "my-skill"\ndescription: "描述该 Skill 的能力与触发场景。"\ncompatibility: "说明所需的项目结构、命令或环境。"\nmetadata:\n  author: "andy"\n  source: "assets/skills/my-skill/SKILL.md"\n---\n\n# 我的 Skill\n\n';
  clearEditorError(); updateEditor(); for (const button of document.querySelectorAll('.asset-item')) { button.classList.remove('selected'); button.removeAttribute('aria-current'); } $('asset-name').focus();
};
$('asset-name').oninput = () => {
  const next = $('asset-name').value.trim();
  if (newAsset && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next) && next.length <= 64) {
    $('asset-content').value = $('asset-content').value.replace(`name: "${draftName}"`, `name: "${next}"`).replace(`source: "assets/skills/${draftName}/SKILL.md"`, `source: "assets/skills/${next}/SKILL.md"`);
    draftName = next;
  }
  clearEditorError(); updateEditor();
};
$('asset-content').oninput = () => { clearEditorError(); updateEditor(); };
$('save-asset').onclick = () => task($('save-asset'), async () => {
  const name = $('asset-name').value.trim(), content = $('asset-content').value;
  const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const rawName = front?.match(/^name:\s*(.+)$/m)?.[1]?.trim(); let headerName = rawName;
  try { if (rawName?.startsWith('"')) headerName = JSON.parse(rawName); else if (rawName?.startsWith("'")) headerName = rawName.slice(1, -1); } catch { headerName = null; }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64 || ((!selectedAsset || ['skills','agents'].includes(selectedAsset.type)) && (headerName !== name || !/^description:[ \t]*\S/m.test(front || '')))) {
    $('editor-error').textContent = '请填写有效名称（小写字母、数字与单连字符，最多 64 字符），并与头部 name 保持一致；description 不可为空。'; $('editor-error').hidden = false; $('asset-name').setAttribute('aria-invalid', 'true'); $('asset-content').setAttribute('aria-invalid', 'true'); return;
  }
  const type = selectedAsset?.type || 'skills';
  await api('asset', { name, content, type, revision: selectedAsset?.revision || null });
  const projectChoice = selection('project'); const defaultsChoice = selection('default'); const previousDefaults = state.defaults;
  newAsset = false; selectedAsset = null; await load(state.project); choices('project', projectChoice); choices('default', defaultsChoice); state.defaults = previousDefaults; updateCount(); updateDefaults();
  editAsset(state.inventory.find(a => a.name === name && a.type === type)); notice('资产已保存到个人资产库。需要更新项目副本时，请到项目配置中预览并应用。');
});
$('save-defaults').onclick = () => task($('save-defaults'), async () => { const chosen = selection('default'); await api('defaults', { config: chosen, previous: state.defaults }); state.defaults = chosen; updateDefaults(); notice('默认偏好已保存，Web 新项目将沿用这些选择；CLI 初始化默认安装全部 Skill。'); });
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !$('assets-view').hidden) { event.preventDefault(); $('save-asset').click(); } });
window.addEventListener('beforeunload', event => { if (memoryDirty() || editorDirty() || projectSelectionDirty() || (state && !same(selection('default'), state.defaults))) { event.preventDefault(); event.returnValue = ''; } });
if (location.protocol === 'file:') {
  notice('请运行 my-ai-infra web，并使用终端输出的本地链接打开工作台；不能直接打开 HTML 文件。', true);
  for (const control of document.querySelectorAll('main button, main input, main textarea')) control.disabled = true;
} else load().catch(e => notice(e.message, true));

function memoryDirty() { return Boolean(memoryDocument && $('memory-content').value !== memoryDocument.content); }
function updateMemory() {
  $('memory-save').disabled = !memoryDirty() || !memoryDocument?.relative || $('memory-save').getAttribute('aria-busy') === 'true';
  $('memory-status').textContent = !memoryDocument ? '未读取' : memoryDirty() ? '未保存' : '已读取';
  $('memory-bind').hidden = $('memory-scope').value === 'global' || Boolean(memoryDocument?.projectId);
}
function memoryTarget() {
  const scope = $('memory-scope').value;
  if (scope === 'project' && !state?.project) throw Error('请先在项目配置中打开项目');
  return { scope, ...(state?.project ? { project: state.project } : {}) };
}
function memoryWriteTarget(document = memoryDocument) {
  if (!document) throw Error('请先读取记忆');
  return { scope: document.scope, ...(document.requestedProject ? { project: document.requestedProject } : {}) };
}
async function showMemory(result) {
  if (result.scope !== $('memory-scope').value || (result.requestedProject && result.requestedProject !== state?.project)) return;
  $('memory-result').textContent = '记忆已重新读取，请重新预览。';
  memoryDocument = result;
  $('memory-content').value = result.content; $('memory-content').disabled = !result.relative;
  $('memory-location').textContent = result.path || '当前项目尚未绑定。首次保存前绑定，不会生成默认偏好。';
  $('memory-entries').replaceChildren();
  for (const entry of result.entries) {
    const item = element('div', undefined, 'memory-entry');
    item.append(element('strong', entry.title), element('small', ({approved:'已生效', inbox:'待确认', deprecated:'已停用'})[entry.status] + ' · ' + entry.scenes.join(', ')), element('p', entry.body), element('small', '依据：' + entry.evidence));
    for (const [label, status] of entry.status === 'approved' ? [['停用','deprecated'],['删除',null]] : [['确认生效','approved'],['删除',null]]) {
      const button = element('button', label, 'text-button');
      button.onclick = () => task(button, async () => {
        if (!await mayDiscard(memoryDirty())) return;
        await showMemory(await api(status ? 'memory/status' : 'memory/delete', { ...memoryWriteTarget(result), id: entry.id, status, revision: result.revision }));
        notice(status ? '记忆状态已更新。' : '记忆已删除，不再参与检索。');
      });
      item.append(button);
    }
    $('memory-entries').append(item);
  }
  if (!result.entries.length) $('memory-entries').append(element('p', '暂无记忆。没有值得长期保留的偏好时，保持为空。', 'hint'));
  updateMemory();
}
$('memory-content').oninput = updateMemory;
$('memory-load').onclick = () => task($('memory-load'), async () => { if (await mayDiscard(memoryDirty())) await showMemory(await api('memory/read', memoryTarget())); });
$('memory-scope').onchange = async () => {
  if (!await mayDiscard(memoryDirty())) { $('memory-scope').value = memoryDocument.scope; return; }
  memoryDocument = null; $('memory-content').value = ''; $('memory-content').disabled = true; $('memory-entries').replaceChildren(); updateMemory(); $('memory-load').click();
};
$('memory-bind').onclick = () => task($('memory-bind'), async () => { await api('memory/bind', memoryTarget()); await showMemory(await api('memory/read', memoryTarget())); notice('项目已绑定。记忆会随稳定项目标识保留。'); });
$('memory-save').onclick = () => task($('memory-save'), async () => { await showMemory(await api('memory/save', { ...memoryWriteTarget(), content: $('memory-content').value, revision: memoryDocument.revision })); notice('个人记忆已保存。'); });
$('memory-recall').onclick = () => task($('memory-recall'), async () => {
  if (!state?.project) throw Error('请先打开项目，再预览本次任务使用的偏好');
  const result = await api('memory/recall', { project: state.project, scene: $('memory-scene').value });
  $('memory-result').textContent = (result.context || '无适用的已生效偏好。') + '\n\n' + result.excluded.map(e => `${e.scope}/${e.id}：${e.reason}`).join('\n');
});
