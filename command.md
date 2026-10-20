# Commands

## VS Code Command Palette

Open the Command Palette with **Ctrl+Shift+P** on Windows/Linux or **Cmd+Shift+P** on macOS, then run one of these commands:

| Command Palette label | Command ID | What it does |
| --- | --- | --- |
| `.NET Tools: Refresh Projects` | `dotnetCrud.refreshProjects` | Refreshes the project list in the .NET Developer Toolkit sidebar. |
| `.NET Tools: Build` | `dotnetCrud.build` | Builds the first .NET project discovered in the current workspace. |
| `.NET Tools: Run` | `dotnetCrud.run` | Runs the first .NET project discovered in the current workspace. |
| `.NET Tools: Watch` | `dotnetCrud.watch` | Starts `dotnet watch` for the first .NET project discovered in the current workspace. |

The Build, Run, and Watch Command Palette commands use the first project discovered in the workspace. To target a specific project, open **.NET Developer Toolkit** from the **.NET Tools** Activity Bar icon and use its project selector and action buttons. Run and Watch are long-lived; stop them from the sidebar before starting another process for that project.

## Sidebar actions

The **.NET Developer Toolkit** sidebar also provides:

- **Refresh projects** to rediscover workspace projects, models, contexts, and API routes.
- **Build**, **Run**, and **Watch** for the selected project.
- **Stop application** or **Stop watch** for an active Run/Watch process.
- **Generate scaffold** for MVC CRUD, API controllers, models, and DbContexts.
- PostgreSQL connection and EF Core migration actions.

API endpoints are discovered from source and shown in the sidebar dropdown; the extension does not execute requests to those endpoints.

## Development and packaging commands

Run these commands from the repository root in PowerShell:

```powershell
# Run all tests
npm test

# Check extension.js syntax
npm run check

# Check syntax of other changed JavaScript files as needed
node --check src\services\projectService.js
node --check src\providers\sidebarProvider.js
node --check media\sidebar.js

# Check the patch for whitespace errors
git diff --check

# Package a Marketplace VSIX
npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository --no-rewrite-relative-links

# Install the generated VSIX locally in VS Code
code --install-extension .\dotnet-toolkit-0.0.1.vsix
```

The VSIX command above allows packaging without a Git repository URL and preserves relative README links as written. Add a repository URL to `package.json` before publishing if you want Marketplace README links to resolve to the source repository.

For the development Extension Host, open the repository in VS Code and press **F5**.
