# AI Coding Context

## Project

This repository contains a CommonJS Visual Studio Code extension named **.NET Developer Toolkit**. It discovers ASP.NET Core projects and API route templates and provides project commands, scaffolding, EF Core migrations, and PostgreSQL connection setup through an Activity Bar webview.

## Architecture

- `extension.js` activates the extension, registers the webview provider and contributed commands, and owns disposables.
- `src/providers/sidebarProvider.js` handles webview messages, project selection, database workflows, and Run/Watch child-process lifecycles.
- `src/services/` contains project and API endpoint discovery, .NET process execution, scaffolding orchestration, PostgreSQL/migration work, and the standalone API client.
- `src/generators/` produces C# and Razor source content.
- `src/utils/` contains validation and filesystem helpers.
- `media/sidebar.html`, `sidebar.css`, and `sidebar.js` implement the webview. Messages cross the extension/webview boundary using VS Code's message API.
- `test/` uses Node's built-in test runner.

## Development rules

- Keep the CommonJS style and existing service/generator boundaries.
- Prefer small changes that follow current validation, error reporting, and test patterns.
- Treat generated project files and database migrations as user data. Do not silently overwrite files or roll back a migration that has already been created.
- Never persist database credentials in workspace files. Continue using VS Code `SecretStorage`, pass credentials only through the child-process environment, and redact them from errors and output.
- Validate project directories against the selected workspace before writing files or invoking project-specific operations.
- When changing a webview interaction, keep the UI and provider protocol consistent and handle webview recreation where relevant.
- API endpoint discovery scans C# source for API controller HTTP attributes and minimal API route mappings; it does not probe a running server.
- Run/watch processes are long-lived: signal successful startup separately from eventual process exit and maintain Stop state. Build and migration commands are finite operations.
- Add focused regression tests for behavior changes. Keep documentation in sync with user-visible behavior.

## Validation

- `npm test` runs the complete test suite (`node --test`).
- `npm run check` checks `extension.js`; for broader JavaScript changes, also run `node --check` on affected JavaScript files.
- Run `git diff --check` before finishing to catch whitespace errors.
- No additional runtime or development dependencies are currently required for the test suite.
- The extension declares the MIT license; keep the root `LICENSE` file and documentation links in sync with the package metadata.

## Safe AI workflow

1. Read the relevant service, caller/provider, UI, and tests before editing.
2. Describe the intended behavior and identify any schema, file, or compatibility risks.
3. Make the smallest complete change and add regression coverage.
4. Run targeted validation, then the full test suite when practical.
5. Report what changed, what was validated, and any manual setup or migration step still needed.
