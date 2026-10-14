import path from 'node:path';
import { hash } from './fs.mjs';
import { snapshot, equalEntry } from './entries.mjs';

export const LEGACY_RULE_FILES = ['AGENTS.md','CLAUDE.md','.github/copilot-instructions.md','.agents/AGENTS.md'];
const START='<!-- my-ai-infra:start -->', END='<!-- my-ai-infra:end -->';
const REF_START='<!-- my-ai-infra:reference:start -->', REF_END='<!-- my-ai-infra:reference:end -->';
// SHA-256 of normalized templates/instructions.md in public npm 0.0.1 and 0.0.2.
const KNOWN_RULES = new Set(['84380c1e0e8fae625e2e21136a0af63e2830e41d3efa92e32314f5e9aa6a6d22']);
function extract(text, first, last) {
  let start=text.indexOf(first);const end=text.indexOf(last);
  if(start<0&&end<0)return null;
  if(start<0||end<start||text.indexOf(first,start+first.length)>=0||text.indexOf(last,end+last.length)>=0)throw Error('ambiguous');
  if(text.slice(Math.max(0,start-2),start)==='# ')start-=2;
  return text.slice(start,end+last.length);
}
function known(block) {
  const inner=block.slice(block.indexOf(START)+START.length,block.indexOf(END)).replace(/\r\n/g,'\n').trim();
  const match=inner.match(/^([\s\S]+)\n\n可用 Skill：[a-z0-9-]+(?:,\s*[a-z0-9-]+)*。$/);
  return Boolean(match&&KNOWN_RULES.has(hash(match[1].trim())));
}
function strip(text, previous) {
  let result=text,warning;
  for(const [first,last,kind] of [[START,END,'block'],[REF_START,REF_END,'reference']]) {
    let owned;
    try { owned=extract(result,first,last); }
    catch { warning='历史规则标记不完整或重复，已原样保留，请人工核对清理';continue; }
    if(owned===null)continue;
    if((previous?.kind===kind&&previous.hash===hash(owned))||(kind==='block'&&known(owned)))result=result.replace(owned,'');
    else warning='历史规则片段无法确认未修改，已原样保留；安装器不再管理该文件，请人工核对清理';
  }
  return {text:result,warning};
}
export async function legacyRuleActions(root, oldFiles, inspect = relative => snapshot(root, relative)) {
  const actions=[],canonical='.agents/AGENTS.md';
  let source;
  try { source=await inspect(canonical); } catch { actions.push({path:canonical,action:'preserve',before:null,after:null,note:'已有规则路径无法安全读取，未修改该路径'}); }
  const cleaned=source?.kind==='file'?strip(source.text,oldFiles[canonical]):null;
  const aliases=[];
  for(const relative of LEGACY_RULE_FILES.filter(file=>file!==canonical)) {
    let before;
    try { before=await inspect(relative); }
    catch { actions.push({path:relative,action:'preserve',before:null,after:null,note:'规则路径包含目录软链接，未读取或修改'});continue; }
    if(before===null)continue;
    if(before.kind==='file') {
      const result=strip(before.text,oldFiles[relative]);
      const changed=result.text!==before.text;
      const after=changed&&!result.text.trim()?null:{kind:'file',text:result.text};
      actions.push({path:relative,action:!changed?'preserve':after===null?'remove':'update',before,after,note:result.warning||(changed?'备份并移除已确认的旧版 SDD 片段，保留项目规则':'保留项目运行规则，不注入 SDD 流程或引用')});
    } else if(before.kind==='symlink') aliases.push({relative,before});
  }
  const emptySource=cleaned&&cleaned.text!==source.text&&!cleaned.text.trim();
  // Do not remove a shared source behind unfamiliar aliases, even if it becomes empty.
  const unfamiliar=aliases.some(({relative,before})=>path.resolve(root,path.dirname(relative),before.target)===path.resolve(root,canonical)&&before.target!==path.posix.relative(path.posix.dirname(relative),canonical));
  for(const {relative,before} of aliases) {
    const expected=path.posix.relative(path.posix.dirname(relative),canonical);
    const previous=oldFiles[relative];
    const knownDangling=source===null&&previous?.kind==='symlink'&&previous.target===before.target&&previous.hash===hash(before.target);
    const remove=(emptySource&&!unfamiliar||knownDangling)&&before.target===expected;
    actions.push({path:relative,action:remove?'remove':'preserve',before,after:remove?null:before,note:remove?'移除仅指向旧版 SDD 生成内容的入口':'保留已有规则链接，不跟随未知链接或重写项目约定'});
  }
  if(source?.kind==='file') {
    const changed=cleaned.text!==source.text;
    const after=emptySource&&!unfamiliar?null:{kind:'file',text:cleaned.text};
    actions.push({path:canonical,action:!changed?'preserve':after===null?'remove':'update',before:source,after,note:cleaned.warning||(changed?'备份并清理旧版生成规则；项目自身内容保留':'保留原有项目规则，不再作为安装器生成资产管理')});
  }
  return actions;
}
