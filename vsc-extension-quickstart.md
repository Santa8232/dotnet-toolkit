# .NET Developer Toolkit: Development Quickstart

## Run the extension locally

1. Open this repository in VS Code.
2. Press **F5** to launch an Extension Development Host.
3. In the new window, open a workspace containing an ASP.NET Core `.csproj`.
4. Open **.NET Developer Toolkit** from the **.NET Tools** Activity Bar icon.
5. Select a project. The sidebar discovers project files, models, EF Core contexts, and API controller/minimal API route templates.

API endpoint discovery is a static scan of C# source. It does not inspect a running server or send requests.

## Validate changes

Run the test suite and extension syntax check from the repository root:

```powershell
npm test
npm run check
```

For changes to other JavaScript files, also run `node --check` on each affected file. Run `git diff --check` before submitting changes.

## Package for Visual Studio Marketplace

1. Confirm `publisher` in `package.json` matches your Marketplace publisher ID and choose the intended extension version.
2. Ensure the manifest license has a matching root `LICENSE` file.
3. Run tests and checks, then package with `npx @vscode/vsce package`.
4. Inspect the generated `.vsix` and its included files before uploading through the Visual Studio Marketplace publisher portal.

Packaging does not publish or upload the extension. See the [VS Code extension publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for publisher setup and release steps.

## Project documentation

- [Getting started](./docs/getting-started.md)
- [Scaffolding and API endpoints](./docs/scaffolding.md)
- [PostgreSQL and model updates](./docs/postgresql-and-models.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [MIT License](./LICENSE)
