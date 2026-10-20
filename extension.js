
function activate(context) {
    console.log('.NET Developer Toolkit activated');
    return registerExtension(context, require('vscode'));
}

function registerExtension(context, vscode) {
    const { SidebarProvider } = require('./src/providers/sidebarProvider');
    const projectService = require('./src/services/projectService');
    const provider = new SidebarProvider(context.extensionUri, vscode, context.secrets);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('dotnetCrudPanel', provider),
        { dispose: () => provider.dispose() },
        vscode.commands.registerCommand(
            'dotnetCrud.refreshProjects',
            () => provider.refreshProjects()
        ),
        ...['build', 'run', 'watch'].map((command) =>
            vscode.commands.registerCommand(`dotnetCrud.${command}`, async () => {
                try {
                    const workspace = vscode.workspace.workspaceFolders?.[0];
                    if (!workspace) {
                        vscode.window.showWarningMessage('Open a workspace containing a .NET project first.');
                        return;
                    }

                    const projects = await projectService.discoverProjects(workspace.uri.fsPath);
                    if (projects.length === 0) {
                        vscode.window.showWarningMessage('No .NET projects were found in this workspace.');
                        return;
                    }

                    const result = await provider.runDotnetCommand(command, projects[0].directory);
                    if (result.stdout) {
                        const channel = vscode.window.createOutputChannel('.NET Developer Toolkit');
                        channel.append(result.stdout);
                        channel.show(true);
                        context.subscriptions.push(channel);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`.NET ${command} failed: ${error.message}`);
                }
            })
        )
    );

    return provider;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate,
    registerExtension
};
