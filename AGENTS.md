# my-ai-infra development

- Read `README.md` and the relevant source before editing. Use Node.js 22+.
- This is an independent Git repository, also checked out as a submodule in geektime-course. Run Git commands from this repository when changing its code; keep course commits separate.
- All distributable AI assets live in `assets/`. `assets/skills/` is the only editable Skill source. Parent-course Skill entries are symlinks; never copy their contents back here or depend on parent directories for builds.
- Preserve unrelated working changes and user-owned assets. Installation and synchronization must retain conflict handling, backups and read-only previews.
- For code changes run `npm run verify`. For packaging changes also run `npm run release:check`. Browser changes use `npm run test:web` after installing the documented Chromium dependency.
- Keep tests, scripts and generated output out of npm distribution; keep caches, credentials, local memory and `dist/` out of Git.
- Before committing in a submodule, use a development branch. Push this repository's commit before updating the parent repository's submodule pointer. Do not publish npm packages without explicit authorization.
- State claims directly; avoid the Chinese contrast pattern that negates one description before substituting another.
