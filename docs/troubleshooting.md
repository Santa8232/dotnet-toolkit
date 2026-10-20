# Troubleshooting

## The Activity Bar icon or sidebar is missing

- Confirm the extension is running in the intended VS Code profile.
- During extension development, press **F5** and check the Extension Development Host.
- Confirm the **.NET Tools** Activity Bar container has not been hidden through the VS Code context menu.
- Reload the Extension Development Host after changing the extension manifest or webview assets.

## No projects are listed

- Open a workspace folder containing a `.csproj` file.
- Use **Refresh projects**.
- Ensure the project is under the workspace root and is not only present in ignored build-output folders.

## An API endpoint is missing from the dropdown

- Refresh the project list after adding or changing routes.
- The current source scan recognizes API controller HTTP attributes and minimal API `MapGet`/`MapPost`-style methods in `.cs` files.
- Routes created dynamically, registered by conventions, or provided by configuration are not resolved by static source discovery.
- The dropdown displays route templates only; the application does not need to be running.

## Build, Run, or Watch fails

- Run `dotnet --info` in a terminal using the same environment as VS Code to confirm the SDK is available.
- Select the intended project and build configuration.
- For compile errors, use **Build** and inspect the `.NET Toolkit` Output Channel for the command output.
- Run and Watch are long-lived; a running status is expected until you stop the process or it exits.
- Only one Run/Watch process per project can be active from the extension. Stop the active one before starting another.

## EF Core says an entity is not included in the context model

Check that the controller's `Product` type is the same fully-qualified model type registered by the selected context. The context should expose a `DbSet<Product>` or otherwise include the entity in `OnModelCreating`. Also confirm the generated controller injects the context that is registered in `Program.cs`.

If you added MVC CRUD to a project before the context-registration fix, add the `DbSet<T>` and required model namespace to the context manually; existing generated files are not overwritten.

## EF migration build fails

Read the `dotnet build` diagnostics included with the extension error. Fix compiler errors and warnings treated as errors, then retry. For nullable projects, non-nullable reference properties should be initialized or declared nullable according to the application's domain.

## Migration created but database update failed

The source change and migration are preserved after migration creation. Inspect the migration, output, connection target, and database state before retrying. Do not create another migration for the same change without first checking the existing migration files.

## Connection or credentials problems

- Verify PostgreSQL host, port, database, user, and network access.
- Confirm the selected context is the one configured for PostgreSQL.
- Credentials are stored in VS Code `SecretStorage`; reconnect if the saved credential is no longer valid.
- When starting the application outside VS Code's extension, set `DOTNET_TOOLKIT_CONNECTION_STRING` in that process's environment.
- Never paste production credentials into source files, issues, or logs.

The project is distributed under the repository-root [MIT License](../LICENSE).
