# PostgreSQL and Model Updates

The extension uses EF Core migrations to create and evolve the PostgreSQL schema. Database operations change persistent data structures; inspect generated migrations and ensure you selected the intended database before applying them.

## Connect a context

1. Choose an existing EF Core `DbContext`, or use **Create a starter DbContext** and refresh project discovery.
2. Expand **PostgreSQL database**, enter the host, port, database, username, and password, then select **Connect & apply migrations**.
3. The extension adds the Npgsql EF provider and EF design package when needed, ensures a local `dotnet-ef` tool is available, configures the selected context for PostgreSQL using `DOTNET_TOOLKIT_CONNECTION_STRING`, and applies pending migrations.
4. If no migrations exist, the extension creates an initial migration before updating the database.

Credentials are stored in VS Code `SecretStorage`, not in workspace settings or source files. The extension passes the connection string to .NET child processes through the environment and redacts credentials from displayed errors/output. If you run the application outside the extension, provide `DOTNET_TOOLKIT_CONNECTION_STRING` through your own launch environment.

## Generate a model and table

1. Confirm the selected context is connected.
2. Select **Model**, enter a model name, and generate.
3. The extension writes a model under `Models/`, adds a `DbSet<T>` to the selected context, creates a migration, and applies it.

Generated model files are not overwritten. The migration and table steps only happen after the model file has been successfully created.

## Add a property to an existing model

1. Select **Update model (add property)**.
2. Choose the existing model and enter a new property name and C# type.
3. Select **Add property and update database**.

The extension appends the property to the model, creates an EF Core migration, and applies it. A basic `string` property is initialized to `string.Empty` to support nullable-reference-type projects. If migration creation fails before EF creates the migration, the extension restores the model and context source. If EF creates the migration but applying it fails, the migration and source changes are retained so they can be reviewed and recovered; the error should identify that state.

This UI action is additive only. Renaming or removing properties, changing key types, adding relationships, and other complex schema changes should be made directly in the model and handled with a deliberate EF Core migration.

API endpoint discovery is independent of the PostgreSQL connection: routes are found by scanning project source and shown in the sidebar, without contacting the application or database.

## Review and recover migrations

- Inspect the generated migration and model snapshot before committing.
- Back up important data and confirm the database target before applying potentially destructive schema changes.
- If `dotnet ef migrations add` reports only that the build failed, inspect the included `dotnet build` diagnostics and fix the underlying C# project errors before retrying.
- If migration creation succeeded but database update failed, do not blindly repeat the update action. Inspect the migration and database state, correct the issue, then apply pending migrations using the database connection workflow or `dotnet ef database update`.
- For a pre-existing database without matching migration history, baseline it deliberately rather than applying a fresh initial migration blindly.

The project is distributed under the repository-root [MIT License](../LICENSE).
