# .NET Developer Toolkit

A Visual Studio Code extension for common ASP.NET Core development tasks.

## Features

- Discover `.csproj` projects in the open workspace.
- Automatically detect API controller and minimal API routes and display them in an endpoint dropdown.
- Build, run, and watch the selected project.
- Generate MVC CRUD controllers and Razor views from existing models and EF Core contexts.
- Connect an EF Core context to PostgreSQL and apply migrations.
- Generate a model and automatically create its PostgreSQL table when a database is connected.

The endpoint dropdown is populated by scanning C# source for API controller HTTP attributes and minimal API `MapGet`/`MapPost`-style route mappings. It displays detected methods and route templates; it does not call a running application or execute requests.

## PostgreSQL setup

1. Open a workspace containing an ASP.NET Core project. If it has no `DbContext`, expand **PostgreSQL database** and select **Create a starter DbContext**.
2. Refresh the project list if needed, select the new context, and enter the PostgreSQL connection details.
3. Select **Connect & apply migrations**. The extension adds the Npgsql and EF design packages plus a local `dotnet-ef` tool when needed, configures the project to read the connection from `DOTNET_TOOLKIT_CONNECTION_STRING`, and applies migrations. If none exist, it creates an initial migration for the current model.
4. Select **Model** under scaffolding and generate a model. Generated models include an `Id`; the extension adds the model to the selected context, creates an EF Core migration, and applies it to PostgreSQL.
5. To extend an existing model, select **Update model (add property)**, choose the model, and enter a property name and C# type. The extension adds the property without replacing the model file, then creates and applies an EF Core migration. Existing properties cannot be removed or renamed through this action.

When generating MVC CRUD, the selected model is also added to the selected `DbContext` as a `DbSet<T>` if it is not already registered. Existing controller and view files are never overwritten.

Connection details are stored in VS Code SecretStorage, not in workspace settings or project files. Database commands launched by the extension receive the connection through a process environment variable. If the project is launched outside the extension, configure `DOTNET_TOOLKIT_CONNECTION_STRING` in that launch environment too. Migrations can change the database schema; review existing migrations before applying them. Use an empty database for the first migration unless you have manually baselined an existing schema.

## Extension settings

`dotnetCrud.defaultConfiguration` selects the configuration used for build, run, and watch commands (`Debug` or `Release`).

## Documentation

See [`docs/`](./docs/README.md) for setup, scaffolding, PostgreSQL/model update, troubleshooting, and AI-assisted development guides. Coding-agent context and repository conventions are in [`AGENTS.md`](./AGENTS.md). This project is distributed under the [MIT License](./LICENSE).

## Author

Built and maintained by **[Santa Mayengbam](https://santa-mayengbam.web.app/)** — Full Stack Developer & Technical Instructor.
