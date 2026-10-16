# Project instructions for Claude Code

- Write all code, identifiers, file names, comments and commit messages in English.
- Write all user-facing text in Dutch (Belgian). Use `10u15` for times and a decimal comma (`117,5`).
- Never use em dashes in user-facing text.
- Keep the site static: plain HTML, CSS and classic scripts on `window.KK`. No build step, no frameworks, no ES modules (the page must also open from `file://`).
- Calculations live in `js/schedule.js` and must stay free of DOM access.
- Respect the brand colours (`#FFD201`, `#000000`) and keep light mode, dark mode and print working after every change.
- Versions are `v1.<n>` (the number after the dot goes up by one with every published change that users can see; no change for code clean-up or docs only; a big new part of the tool can start `v2.0`). When publishing: set `version` and `released` in `js/config.js`, put the same version as `?v=` on all local `<link>` and `<script>` tags in `index.html` (same value everywhere), and tag the commit (`git tag v1.26 && git push --tags`). GitHub Pages lets browsers cache files for 10 minutes; without a new value visitors can get a mix of old and new files. `v1.0` is the first complete version (commit `8824e32`, 14 October 2026).
- Saved settings and share links hold only values that differ from `KK.config.defaults`. Changing a default therefore reaches every visitor; do not go back to saving the full settings object.
- After a change: open `index.html` to check it, then commit and push to `main` so GitHub Pages updates.
- See `README.md` for calculation rules and file structure.
