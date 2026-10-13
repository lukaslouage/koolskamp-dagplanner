# Setup task for Claude Code

Publish this folder as a public GitHub repository with GitHub Pages. Do the steps below in order and report the live URL at the end.

1. Check that the GitHub CLI is installed (`gh --version`) and logged in (`gh auth status`). If not, explain to the user (in Dutch) how to install it and run `gh auth login`, then wait.
2. In this folder: `git init`, set the default branch to `main`, and add a `.gitignore` with `.DS_Store` and `Thumbs.db`.
3. Commit all files with the message `Initial commit: Koolskamp Koers 2028 day timeline`.
4. Create a public repository named `koolskamp-koers-2028` with description `Interactieve dagtijdlijn Koolskamp Koers 2028` and push: `gh repo create koolskamp-koers-2028 --public --source . --push --description "Interactieve dagtijdlijn Koolskamp Koers 2028"`.
5. Enable GitHub Pages from branch `main`, folder `/`:
   `gh api -X POST repos/{owner}/koolskamp-koers-2028/pages -f "source[branch]=main" -f "source[path]=/"`
   (replace `{owner}` with the logged-in username from `gh api user --jq .login`).
6. Wait until the Pages build is done (`gh api repos/{owner}/koolskamp-koers-2028/pages --jq .status` returns `built`), then give the user the URL `https://{owner}.github.io/koolskamp-koers-2028/`.
7. Tell the user (in Dutch) that future changes can simply be requested in this folder, and that you will commit and push them so the site updates automatically.

Follow `CLAUDE.md` for all later work.
