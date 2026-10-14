import { fileURLToPath } from 'node:url';
import { BUILTINS } from '../src/names.mjs';
import { checkSkillResources } from './check-skill-resources.mjs';

// Retain the command for existing workflows; assets/skills is already the source.
const root = fileURLToPath(new URL('../', import.meta.url));
const errors = await checkSkillResources(root, BUILTINS.map(skill => skill.name));
if (errors.length) throw Error(errors.join('\n'));
console.log(`Skill sources ready: ${BUILTINS.length} canonical assets/skills entries; no copying required.`);
