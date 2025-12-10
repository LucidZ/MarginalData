Complete workflow to ship changes: commit, push, merge to main, and deploy.

This command should:
1. Check git status to see what files have changed
2. Stage the relevant files (exclude node_modules, cache, etc.)
3. Create a descriptive commit with proper footer
4. Push the current branch
5. If not on main, merge the current branch into main (or create a PR if gh CLI is available)
6. Push main
7. Build and deploy to GitHub Pages
8. Report the final status

Ask the user for commit message details if they're not clear from context.
