# Vibe-Coding Workflow for This Extension

Use AI coding tools to move quickly while keeping generated project code, database state, and extension behavior reviewable.

## Start with a bounded request

Give the coding assistant:

- The desired user-visible behavior.
- The relevant part of the extension or screenshot/error output.
- Any constraints, such as preserving generated files, PostgreSQL usage, or backward compatibility.
- A definition of done that includes tests and docs.

Example:

> Add a scaffold action that creates a nullable `DateTime?` property on an existing model and offers a migration preview. Preserve unrelated source, do not apply the migration automatically, and add tests for duplicate properties and migration failure behavior.

## Ask for investigation before edits

For bugs, ask the assistant to trace the complete flow: UI event, webview message, provider handler, service/generator, and user-facing error. Include logs or compiler diagnostics, but remove credentials and other secrets.

For schema changes, state explicitly whether the tool may create a migration, apply it to a database, or only modify source. Prefer review-before-apply for destructive or ambiguous changes.

## Work in small verified increments

1. Ask for a short summary of the relevant code paths and likely cause.
2. Agree on behavior for failure cases before changing files.
3. Make a focused implementation and regression tests.
4. Review the actual diff, generated files, and migration output.
5. Run `npm test`, `npm run check`, and `git diff --check`.
6. Manually verify VS Code webview behavior or a .NET/PostgreSQL integration when the change depends on those runtimes.

## Review checklist

- Does the UI report success only after the operation's real success point?
- Are long-running processes represented as active until they exit?
- Can existing user files or custom code be overwritten?
- Are database credentials kept out of files and output?
- Are migration creation failures distinct from database-apply failures?
- Are project paths constrained to the workspace?
- Do tests cover failure and recovery paths, not only the happy path?
- Does documentation explain any manual migration or recovery step?
- Do source-based API endpoint discovery and its documented limitations match the routes the UI displays?

## Prompt template

```text
Goal:
Current behavior / error:
Expected behavior:
Scope and constraints:
Database or file side effects allowed:
Acceptance checks:

Please inspect the full relevant flow, implement the smallest complete fix,
add regression tests, update relevant docs, and report validation results.
Do not overwrite unrelated files or expose credentials.
```

The project is distributed under the repository-root [MIT License](../LICENSE).
