# Getting Started

## Requirements

- Visual Studio Code meeting the version declared in `package.json`.
- A .NET SDK installed and available as `dotnet` in the extension host environment.
- A workspace folder containing one or more `.csproj` files.
- PostgreSQL is optional; it is required for the database connection and automatic model migration workflows.

## Run the extension during development

1. Open this repository in VS Code.
2. Install project dependencies if the project later adds any; the current unit tests use Node's built-in runner.
3. Press **F5** to open an Extension Development Host.
4. In that host, open a workspace containing a .NET project.
5. Select the **.NET Tools** icon in the Activity Bar and open **.NET Developer Toolkit**.
6. Refresh projects if they are not listed, then select the project to target.

The **API endpoints** dropdown lists routes detected from API controller HTTP attributes and minimal API route mappings in the selected project. It displays source route templates and HTTP methods; it does not need the application to be running and does not send requests.

The extension's tests and syntax check can be run in the repository terminal:

```powershell
npm test
npm run check
```

## Build, run, and watch

Use **Build** for a finite build that reports completion. **Run** and **Watch** start long-lived processes; successful startup is reported separately from process exit. Their output is available in the `.NET Toolkit` Output Channel. Select **Stop application** or **Stop watch** before starting another process for the same project.

The selected build configuration is controlled by `dotnetCrud.defaultConfiguration` (`Debug` or `Release`).

## Where to look next

- To generate files, see [Scaffolding](./scaffolding.md).
- To configure PostgreSQL or update model schema, see [PostgreSQL and model updates](./postgresql-and-models.md).
- If a command fails, see [Troubleshooting](./troubleshooting.md).

The project license is available in the repository-root [LICENSE](../LICENSE) file.
