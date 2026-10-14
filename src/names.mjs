import registry from '../catalog/skills.json' with { type: 'json' };

export const BUILTINS = registry.skills;
export const REMOVED_SKILLS = new Set(registry.removedSkills || []);
export const NAMING_VERSION = registry.namingVersion;
export const ALIASES = Object.fromEntries(BUILTINS.flatMap(s => s.aliases.map(a => [a, s.name])));
export const canonicalName = name => Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
export const definition = name => BUILTINS.find(s => s.name === canonicalName(name));
const matcher = new RegExp('(?<![a-z0-9-])(' + Object.keys(ALIASES).join('|') + ')(?![a-z0-9-]|\\.[a-z0-9]+\\b)', 'g');
export const normalizeText = text => text.replace(matcher, name => ALIASES[name]);
