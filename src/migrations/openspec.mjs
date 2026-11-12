import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOpenSpec } from './openspec-scan.mjs';

export const SOURCE_ID = 'openspec';
export const SOURCE_VERSION = 1;
export const scopes = ['change', 'changes', 'active', 'all'];

export function migrationHelp(source) {
  if (!source) return `mai migrate <来源> [--project PATH]
来源：
  openspec  导入活动 change，或用 --all 切换整个 OpenSpec 工作区
mai migrate openspec --help
mai migrate recover --dry-run`;
  if (source !== SOURCE_ID) return `未知来源：${source}\n${migrationHelp()}`;
  return `mai migrate openspec (--change ID | --changes ID ID... | --active | --all) (--dry-run | --revision HASH) [--project PATH]
--change   导入一个活动 change，OpenSpec 继续维护现行规格和归档
--changes  一次导入至少两个活动 change，ID 用空格分开；任一项阻塞则整批不写入
--active   导入当前全部活动 change，不包含 archive
--all      切换整个工作区：活动 change 和已归档 change 按 MAI 布局建立 Feature
原 openspec/ 目录始终保留。预览只读；提交必须使用本次预览的 revision。
示例：mai migrate openspec --change add-login --dry-run`;
}
