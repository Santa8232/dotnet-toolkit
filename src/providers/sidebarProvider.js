'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { discoverProjects, discoverMvcArtifacts } = require('../services/projectService');
const dotnetService = require('../services/dotnetService');
const { scaffold } = require('../services/scaffoldService');
const { validateProjectDirectory } = require('../utils/validation');
const {
    addModelAndUpdate,
    connectAndUpdate,
    CONNECTION_ENVIRONMENT_VARIABLE,
    createPostgresConnectionString,
    getConnectionSecretKey,
    sanitizeErrorMessage,
    updateModelAndUpdate
} = require('../services/databaseService');

class SidebarProvider {
    constructor(extensionUri, vscode, secrets) {
        this.extensionUri = extensionUri;
        this.vscode = vscode;
        this.panel = undefined;
        this.workspaceRoot = undefined;
        this.secrets = secrets;
        this.outputChannel = undefined;
        this.activeProcesses = new Map();
    }

    sendProcessState() {
        this.postMessage({
            command: 'processState',
            processes: [...this.activeProcesses.entries()].map(([projectDirectory, processInfo]) => ({
                command: processInfo.command,
                projectDirectory: path.resolve(projectDirectory),
                starting: !processInfo.child
            }))
        });
    }

    resolveWebviewView(webviewView) {
        this.panel = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.vscode.Uri.joinPath(this.extensionUri, 'media')]
        };
        webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));
        webviewView.webview.html = this.getHtml(webviewView.webview);
    }

    getHtml(webview) {
        const mediaDirectory = this.vscode.Uri.joinPath(this.extensionUri, 'media');
        const html = fs.readFileSync(path.join(this.extensionUri.fsPath, 'media', 'sidebar.html'), 'utf8');
        return html
            .replaceAll('{{styleUri}}', webview.asWebviewUri(this.vscode.Uri.joinPath(mediaDirectory, 'sidebar.css')))
            .replaceAll('{{scriptUri}}', webview.asWebviewUri(this.vscode.Uri.joinPath(mediaDirectory, 'sidebar.js')))
            .replaceAll('{{cspSource}}', webview.cspSource)
            .replaceAll('{{nonce}}', createNonce());
    }

    async handleMessage(message) {
        try {
            switch (message?.command) {
                case 'refresh':
                    await this.refreshProjects();
                    break;
                case 'ready':
                    this.sendProcessState();
                    break;
                case 'openFolder':
                    await this.openFolder();
                    break;
                case 'databaseStatus':
                    await this.sendDatabaseStatus(message.projectDirectory, message.contextName);
                    break;
                case 'connectDatabase':
                    await this.connectDatabase(message);
                    break;
                case 'stopProcess':
                    await this.stopProcess(message.projectDirectory);
                    break;
                case 'scaffold':
                    await this.scaffoldProject(message);
                    break;
                case 'build':
                case 'run':
                case 'watch':
                    await this.runDotnetCommand(message.command, message.projectDirectory, message.contextName);
                    break;
                default:
                    throw new Error(`Unknown sidebar command: ${message?.command}`);
            }
        } catch (error) {
            const safeMessage = sanitizeErrorMessage(error, [message?.connection?.password]);
            this.postMessage({
                command: 'error',
                message: error?.migrationCreated
                    ? `Model updated and migration ${error.migrationName} created, but applying it to PostgreSQL failed: ${safeMessage}`
                    : safeMessage,
                createdFiles: Boolean(error && error.createdFiles),
                refreshProjects: Boolean(error && error.migrationCreated),
                projectDirectory: message?.projectDirectory
            });
        }
    }

    async refreshProjects() {
        const folders = this.vscode.workspace.workspaceFolders || [];
        if (folders.length === 0) {
            this.workspaceRoot = undefined;
            this.postMessage({
                command: 'projects',
                projects: [],
                hasWorkspace: false,
                emptyMessage: 'Open a workspace folder to find .NET projects.'
            });
            return;
        }

        this.workspaceRoot = folders[0].uri.fsPath;
        const projects = await discoverProjects(this.workspaceRoot);
        this.postMessage({
            command: 'projects',
            projects,
            hasWorkspace: true,
            emptyMessage: 'No .csproj files found. Open a .NET project or refresh to try again.'
        });
    }

    async openFolder() {
        const folders = await this.vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Open workspace folder'
        });
        if (folders?.[0]) {
            await this.vscode.commands.executeCommand('vscode.openFolder', folders[0], true);
        }
    }

    async scaffoldProject(message) {
        const projectDirectory = this.getProjectDirectory(message.projectDirectory);
        let context;
        let databaseConnection;
        let model;
        if (message.type === 'model' || message.type === 'updateModel') {
            if (!message.contextName) {
                throw new Error('Choose a DbContext so the model can be synchronized with the database.');
            }
            if (!this.secrets) {
                throw new Error('VS Code secure storage is unavailable; database scaffolding cannot continue safely.');
            }

            const artifacts = await discoverMvcArtifacts(projectDirectory);
            context = artifacts.dbContexts.find((item) => item.name === message.contextName);
            if (!context) {
                throw new Error('The selected DbContext was not found. Refresh projects and try again.');
            }
            if (message.type === 'updateModel') {
                model = artifacts.models.find((item) => item.name === message.modelName);
                if (!model) {
                    throw new Error('The selected model was not found. Refresh projects and try again.');
                }
            }
            const key = getConnectionSecretKey(projectDirectory, context.name);
            databaseConnection = await this.secrets.get(key);
            if (!databaseConnection) {
                throw new Error('Connect and apply your PostgreSQL database before changing a model.');
            }
        }

        if (message.type === 'updateModel') {
            let migrationName;
            try {
                migrationName = await updateModelAndUpdate({
                    projectDirectory,
                    context,
                    model,
                    propertyName: message.propertyName,
                    propertyType: message.propertyType,
                    connectionString: databaseConnection
                });
            } catch (error) {
                const failure = new Error(sanitizeErrorMessage(error, [databaseConnection]), { cause: error });
                if (error.migrationCreated) {
                    failure.migrationCreated = true;
                    failure.migrationName = error.migrationName;
                }
                throw failure;
            }
            this.postMessage({
                command: 'success',
                message: `Added ${message.propertyName} to ${model.name} and applied migration ${migrationName}.`,
                createdFiles: true,
                updatedModel: true
            });
            return;
        }

        const files = await scaffold({
            type: message.type,
            name: message.name,
            modelName: message.modelName,
            contextName: message.contextName,
            projectDirectory,
            workspaceRoot: this.workspaceRoot
        });
        let successMessage = `Generated ${files.length} file(s).`;
        if (message.type === 'model') {
            try {
                const migrationName = await addModelAndUpdate({
                    projectDirectory,
                    context,
                    model: {
                        name: message.name,
                        namespace: 'Models',
                        path: path.join(projectDirectory, 'Models', `${message.name}.cs`)
                    },
                    connectionString: databaseConnection
                });
                successMessage = `Generated ${message.name} and created its PostgreSQL table (${migrationName}).`;
            } catch (error) {
                const safeMessage = sanitizeErrorMessage(error, [databaseConnection]);
                const failure = new Error(`Model files were generated, but PostgreSQL table creation failed: ${safeMessage}`, { cause: error });
                failure.createdFiles = true;
                throw failure;
            }
        }
        this.postMessage({
            command: 'success',
            message: message.type === 'dbContext'
                ? `Created ${message.name}. Refresh the project list, then connect PostgreSQL.`
                : successMessage,
            createdFiles: message.type === 'model' || message.type === 'dbContext'
        });
    }

    async connectDatabase(message) {
        const projectDirectory = this.getProjectDirectory(message.projectDirectory);
        if (!this.secrets) {
            throw new Error('VS Code secure storage is unavailable; database credentials cannot be saved safely.');
        }

        const artifacts = await discoverMvcArtifacts(projectDirectory);
        const context = artifacts.dbContexts.find((item) => item.name === message.contextName);
        if (!context) {
            throw new Error('Choose an Entity Framework DbContext in the selected project.');
        }

        const connectionString = createPostgresConnectionString(message.connection || {});
        const result = await connectAndUpdate({
            projectDirectory,
            context,
            connection: message.connection
        });
        await this.secrets.store(result.secretKey, connectionString);
        this.postMessage({
            command: 'success',
            message: result.createdInitialMigration
                ? 'Connected to PostgreSQL, created an initial migration, and created the existing model tables.'
                : 'Connected to PostgreSQL and applied pending migrations.',
            databaseConfigured: true
        });
    }

    async sendDatabaseStatus(projectDirectory, contextName) {
        const directory = this.getProjectDirectory(projectDirectory);
        if (!contextName || !this.secrets) {
            this.postMessage({
                command: 'databaseStatus',
                configured: false,
                contextName,
                projectDirectory: directory
            });
            return;
        }

        const key = getConnectionSecretKey(directory, contextName);
        this.postMessage({
            command: 'databaseStatus',
            configured: Boolean(await this.secrets.get(key)),
            contextName,
            projectDirectory: directory
        });
    }

    async runDotnetCommand(command, projectDirectory, contextName) {
        const directory = this.getProjectDirectory(projectDirectory);
        if (command === 'run' || command === 'watch') {
            return this.startDotnetCommand(command, directory, contextName);
        }

        let connectionString;
        if (this.secrets && contextName) {
            connectionString = await this.secrets.get(getConnectionSecretKey(directory, contextName));
        } else if (this.secrets) {
            const contexts = (await discoverMvcArtifacts(directory)).dbContexts;
            for (const context of contexts) {
                connectionString = await this.secrets.get(getConnectionSecretKey(directory, context.name));
                if (connectionString) break;
            }
        }
        let result;
        try {
            result = await dotnetService[command](directory, {
                configuration: this.vscode.workspace.getConfiguration('dotnetCrud').get('defaultConfiguration', 'Debug'),
                env: connectionString ? { [CONNECTION_ENVIRONMENT_VARIABLE]: connectionString } : undefined
            });
        } catch (error) {
            throw new Error(sanitizeErrorMessage(error, getSensitiveConnectionValues(connectionString)), { cause: error });
        }
        this.writeOutput(result.stdout, result.stderr);
        this.getOutputChannel().show(true);
        this.postMessage({ command: 'success', message: `${command[0].toUpperCase()}${command.slice(1)} completed successfully.` });
        return {
            ...result,
            stdout: sanitizeErrorMessage(new Error(result.stdout), getSensitiveConnectionValues(connectionString)),
            stderr: sanitizeErrorMessage(new Error(result.stderr), getSensitiveConnectionValues(connectionString))
        };
    }

    async startDotnetCommand(command, directory, contextName) {
        if (this.activeProcesses.has(directory)) {
            throw new Error('A .NET process is already running for this project. Stop it before starting another.');
        }

        let connectionString;
        if (contextName && this.secrets) {
            connectionString = await this.secrets.get(getConnectionSecretKey(directory, contextName));
        } else if (this.secrets) {
            const contexts = (await discoverMvcArtifacts(directory)).dbContexts;
            for (const context of contexts) {
                connectionString = await this.secrets.get(getConnectionSecretKey(directory, context.name));
                if (connectionString) break;
            }
        }

        const sensitiveValues = getSensitiveConnectionValues(connectionString);
        const processInfo = { command, child: undefined, stopRequested: false };
        this.activeProcesses.set(directory, processInfo);

        try {
            processInfo.child = await dotnetService.startProjectCommand(command, directory, {
                configuration: this.vscode.workspace.getConfiguration('dotnetCrud').get('defaultConfiguration', 'Debug'),
                env: connectionString ? { [CONNECTION_ENVIRONMENT_VARIABLE]: connectionString } : undefined,
                onSpawn: (child) => {
                    processInfo.child = child;
                    this.getOutputChannel().show(true);
                    this.postMessage({
                        command: 'started',
                        processCommand: command,
                        projectDirectory: directory,
                        message: `${command === 'watch' ? 'Watch' : 'Application'} started. Output is in the .NET Toolkit channel.`
                    });
                },
                onOutput: ({ stream, data }) => {
                    const safeText = sanitizeErrorMessage(new Error(data), sensitiveValues);
                    if (stream === 'stderr') {
                        this.writeOutput('', safeText);
                    } else {
                        this.writeOutput(safeText);
                    }
                },
                onExit: ({ code, signal }) => {
                    if (this.activeProcesses.get(directory) !== processInfo) return;
                    this.activeProcesses.delete(directory);
                    const stopped = processInfo.stopRequested;
                    this.postMessage({
                        command: 'processExit',
                        processCommand: command,
                        projectDirectory: directory,
                        code,
                        signal,
                        stopped,
                        message: stopped
                            ? `${command === 'watch' ? 'Watch' : 'Application'} stopped.`
                            : code === 0
                                ? `${command === 'watch' ? 'Watch' : 'Application'} exited successfully.`
                                : `${command === 'watch' ? 'Watch' : 'Application'} exited with code ${code ?? 'unknown'}.`
                    });
                },
                onError: (error) => {
                    if (this.activeProcesses.get(directory) !== processInfo) return;
                    this.activeProcesses.delete(directory);
                    this.postMessage({
                        command: 'processExit',
                        message: sanitizeErrorMessage(error, sensitiveValues),
                        processCommand: command,
                        projectDirectory: directory,
                        failed: true,
                        code: null
                    });
                }
            });
        } catch (error) {
            if (this.activeProcesses.get(directory) === processInfo) {
                this.activeProcesses.delete(directory);
            }
            throw new Error(sanitizeErrorMessage(error, sensitiveValues), { cause: error });
        }

    }

    async stopProcess(projectDirectory) {
        const directory = this.getProjectDirectory(projectDirectory);
        const processInfo = this.activeProcesses.get(directory);
        if (!processInfo?.child) {
            throw new Error('There is no active Run or Watch process for this project.');
        }

        processInfo.stopRequested = true;
        await dotnetService.stopProcess(processInfo.child);
    }

    writeOutput(stdout, stderr = '') {
        const channel = this.getOutputChannel();
        if (stdout) channel.append(stdout);
        if (stderr) channel.append(stderr);
    }

    getOutputChannel() {
        if (!this.outputChannel) {
            this.outputChannel = this.vscode.window.createOutputChannel('.NET Toolkit');
        }
        return this.outputChannel;
    }

    dispose() {
        for (const processInfo of this.activeProcesses.values()) {
            if (processInfo.child) {
                dotnetService.stopProcess(processInfo.child)
                    .catch((error) => console.error(`Failed to stop .NET ${processInfo.command}: ${error.message}`));
            }
        }
        this.outputChannel?.dispose();
    }

    getProjectDirectory(projectDirectory) {
        if (!projectDirectory) {
            throw new Error('Select a .NET project first.');
        }
        return validateProjectDirectory(projectDirectory, this.workspaceRoot);
    }

    postMessage(message) {
        if (this.panel) {
            this.panel.webview.postMessage(message);
        }
    }
}

function createNonce() {
    return crypto.randomBytes(16).toString('hex');
}

function getSensitiveConnectionValues(connectionString) {
    if (typeof connectionString !== 'string') {
        return [];
    }
    const password = connectionString.match(/(?:^|;)Password="((?:[^"]|"")*)"/i);
    return [
        connectionString,
        password ? password[1].replaceAll('""', '"') : undefined
    ];
}

module.exports = { SidebarProvider };
