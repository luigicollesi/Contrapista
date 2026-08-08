# AGENTS.md

## Core Rules

* Search before reading.
* Read only files and sections relevant to the task.
* Make the smallest correct change.
* Do not modify unrelated code.
* Reuse existing patterns before creating new abstractions.
* Prefer simple, maintainable solutions over clever ones.
* Avoid unnecessary dependencies.
* Keep command output limited and targeted.
* Validate the affected area before running broad checks.
* Stop when the requested task is complete.

## Skills

Use installed project skills whenever relevant.

Prioritize:

* `vercel-react-best-practices`

  * Next.js / React implementation
  * rendering, data fetching, performance and bundle optimization

* `vercel-composition-patterns`

  * component architecture
  * composition and reusable UI patterns

* `web-design-guidelines`

  * UI/UX
  * responsive design
  * accessibility

* `vercel-react-view-transitions`

  * transitions and navigation animations

* `vercel-optimize`

  * caching, ISR, functions, performance and Vercel optimization

* `deploy-to-vercel`

  * deployment-related work

* `vercel-cli-with-tokens`

  * Vercel CLI and token-based workflows

Before implementing, identify which installed skills apply and follow their instructions.

Do not load or use unrelated skills.

## Next.js

* Follow the conventions of the installed Next.js version.
* Prefer App Router patterns when the project uses App Router.
* Prefer Server Components by default.
* Use Client Components only when browser APIs, state, events or client hooks require them.
* Keep client boundaries small.
* Avoid unnecessary data fetching waterfalls.
* Preserve existing project architecture and styling conventions.

## Quality

Before finishing:

1. Check changed files for obvious regressions.
2. Run the narrowest relevant validation first.
3. Run typecheck, lint or tests only when relevant and available.
4. Fix issues caused by your changes.
5. Do not refactor unrelated code.

## Efficiency

* Do not read the entire repository unless necessary.
* Search for symbols, routes, components and patterns first.
* Avoid reopening files already understood.
* Batch related reads and edits.
* Do not generate large explanations during implementation.
* Keep the final response concise.

## Final Response

Report only:

* what changed
* relevant validation performed
* important caveats, if any
