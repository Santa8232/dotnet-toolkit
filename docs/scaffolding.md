# Scaffolding

The **Add to your project** section generates files under the selected `.NET` project. Generated paths are validated to remain within that project. The extension refuses to overwrite an existing generated file; edit or rename existing files yourself rather than relying on regeneration to replace custom code.

## MVC CRUD

1. Ensure the project contains a public model with an `Id` or `<ModelName>Id` property and an Entity Framework `DbContext`.
2. Select **MVC CRUD (controller + views)**.
3. Choose the model and context, then generate the scaffold.

The scaffold creates a CRUD controller and Razor views for Index, Details, Create, Edit, and Delete, plus view imports. The selected model is added to the selected context as a `DbSet<T>` when it is not already registered. If the project uses a custom context setup or unusual namespaces, review the generated context and controller code before running the app.

## API controller

Select **API controller**, enter a C# identifier, and generate. The generated file is a starter endpoint; tailor its routes, dependencies, validation, and persistence to the application.

## Detected API endpoints

The project sidebar scans `.cs` source files and lists HTTP routes declared with API controller attributes (such as `[HttpGet]` or `[HttpPost]`) and minimal API methods (such as `MapGet` or `MapPost`). Controller route prefixes and `[controller]`/`[action]` tokens are included in the displayed route. This is static source discovery, not live server introspection: routes built dynamically, supplied through configuration, or registered by conventions may not appear. Selecting an endpoint displays it; it does not invoke the API.

## Model

Model creation is tied to the PostgreSQL workflow because the extension also registers the entity, creates an EF Core migration, and applies it. See [PostgreSQL and model updates](./postgresql-and-models.md) before generating a database-backed model.

## Database context

If no context exists, use **Create a starter DbContext** in the PostgreSQL section. Refresh projects to discover it, then connect it to PostgreSQL. The generated starter is intentionally minimal and may need application-specific configuration.

## Review generated changes

After generating:

- Review the new C# and Razor files.
- Build the selected project.
- For database-backed changes, inspect the migration and verify the target database before applying it.
- Check in source and migration files with your normal version-control workflow.

The extension is distributed under the repository-root [MIT License](../LICENSE).
