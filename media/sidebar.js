'use strict';

(() => {
    const vscode = acquireVsCodeApi();
    const projectSelect = document.getElementById('project');
    const projectHelp = document.getElementById('project-help');
    const projectCount = document.getElementById('project-count');
    const openFolderButton = document.getElementById('open-folder');
    const apiEndpointSelect = document.getElementById('api-endpoint');
    const apiEndpointHelp = document.getElementById('api-endpoint-help');
    const scaffoldType = document.getElementById('scaffold-type');
    const mvcOptions = document.getElementById('mvc-options');
    const modelSelect = document.getElementById('mvc-model');
    const contextSelect = document.getElementById('mvc-context');
    const mvcHelp = document.getElementById('mvc-help');
    const customName = document.getElementById('custom-name');
    const modelUpdateOptions = document.getElementById('model-update-options');
    const updateModelSelect = document.getElementById('update-model');
    const propertyNameInput = document.getElementById('property-name');
    const propertyTypeInput = document.getElementById('property-type');
    const databaseContextSelect = document.getElementById('database-context');
    const databaseSummary = document.getElementById('database-summary');
    const databaseContextHelp = document.getElementById('database-context-help');
    const createDbContextButton = document.getElementById('create-db-context');
    const connectDatabaseButton = document.getElementById('connect-database');
    const databaseHost = document.getElementById('database-host');
    const databasePort = document.getElementById('database-port');
    const databaseName = document.getElementById('database-name');
    const databaseUsername = document.getElementById('database-username');
    const databasePassword = document.getElementById('database-password');
    const databaseInputs = [
        databaseHost,
        databasePort,
        databaseName,
        databaseUsername,
        databasePassword
    ];
    const nameInput = document.getElementById('name');
    const nameHelp = document.getElementById('name-help');
    const createButton = document.getElementById('create');
    const refreshButton = document.getElementById('refresh');
    const status = document.getElementById('status');
    const statusMessage = document.getElementById('status-message');
    const commandButtons = [...document.querySelectorAll('[data-command]')];
    const stopProcessButton = document.getElementById('stop-process');
    let isBusy = false;
    let hasWorkspace = false;
    let projects = [];
    let databaseConfigured = false;
    let activeProcess;
    const activeProcesses = new Map();
    let preserveStatusOnRefresh = false;

    const hints = {
        mvc: 'Creates an EF Core CRUD controller and five Razor views.',
        api: 'Creates a starter REST API controller.',
        model: 'Creates a C# model class.',
        dbContext: 'Creates an Entity Framework Core context.'
    };

    function setStatus(message, state = 'idle') {
        statusMessage.textContent = message;
        status.dataset.state = state;
    }

    function updateControls() {
        const hasProject = Boolean(projectSelect.value);
        const isMvc = scaffoldType.value === 'mvc';
        const isModelUpdate = scaffoldType.value === 'updateModel';
        const canScaffold = hasWorkspace && hasProject && !isBusy;
        const hasMvcSelection = Boolean(modelSelect.value && contextSelect.value);
        const hasModelUpdateFields = Boolean(
            updateModelSelect.value
            && propertyNameInput.value.trim()
            && propertyTypeInput.value.trim()
        );
        const hasDatabaseContext = Boolean(databaseContextSelect.value);
        const project = projects.find((item) => item.directory === projectSelect.value);
        const hasDbContexts = Boolean(project?.dbContexts?.length);
        const hasDatabaseFields = Boolean(
            databaseHost.value.trim()
            && databasePort.value
            && databaseName.value.trim()
            && databaseUsername.value.trim()
            && databasePassword.value
            && hasDatabaseContext
        );
        const selectedModelReady = !['model', 'updateModel'].includes(scaffoldType.value)
            || (hasDatabaseContext && databaseConfigured);
        projectSelect.disabled = isBusy || projects.length === 0;
        apiEndpointSelect.disabled = !hasProject || isBusy || apiEndpointSelect.options.length === 0;
        refreshButton.disabled = isBusy;
        activeProcess = activeProcesses.get(projectSelect.value);
        commandButtons.forEach((button) => {
            button.disabled = isBusy || !hasProject || Boolean(activeProcess);
        });
        stopProcessButton.hidden = !activeProcess;
        stopProcessButton.disabled = isBusy || !activeProcess || activeProcess.starting;
        if (activeProcess) {
            stopProcessButton.querySelector('span').textContent =
                activeProcess.command === 'watch' ? 'Stop watch' : 'Stop application';
        }
        scaffoldType.disabled = !hasWorkspace || isBusy;
        mvcOptions.hidden = !isMvc;
        modelSelect.disabled = !canScaffold || !isMvc || modelSelect.options.length === 0;
        contextSelect.disabled = !canScaffold || !isMvc || contextSelect.options.length === 0;
        databaseContextSelect.disabled = !hasProject || isBusy || databaseContextSelect.options.length === 0;
        createDbContextButton.hidden = !hasProject || hasDbContexts;
        createDbContextButton.disabled = isBusy || !hasProject;
        databaseInputs.forEach((input) => {
            input.disabled = !hasProject || isBusy || !hasDatabaseContext;
        });
        connectDatabaseButton.disabled = isBusy || !hasProject || !hasDatabaseFields;
        customName.hidden = isMvc || isModelUpdate;
        modelUpdateOptions.hidden = !isModelUpdate;
        updateModelSelect.disabled = !canScaffold || !isModelUpdate || updateModelSelect.options.length === 0;
        propertyNameInput.disabled = !canScaffold || !isModelUpdate || !updateModelSelect.value;
        propertyTypeInput.disabled = propertyNameInput.disabled;
        nameInput.disabled = !canScaffold || isMvc || isModelUpdate;
        createButton.querySelector('span').textContent = isModelUpdate ? 'Add property and update database' : 'Generate scaffold';
        createButton.disabled = !canScaffold || (isMvc
            ? !hasMvcSelection
            : isModelUpdate
                ? !hasModelUpdateFields || !selectedModelReady
                : !nameInput.value.trim() || !selectedModelReady);
        openFolderButton.hidden = hasWorkspace;
    }

    function populateMvcOptions() {
        const project = projects.find((item) => item.directory === projectSelect.value);
        const models = project?.models || [];
        const contexts = project?.dbContexts || [];
        const previousUpdateModel = updateModelSelect.value;
        const previousModel = modelSelect.value;
        const previousContext = contextSelect.value;
        const previousDatabaseContext = databaseContextSelect.value;
        const previousApiEndpoint = apiEndpointSelect.value;
        const apiEndpoints = project?.apiEndpoints || [];

        modelSelect.replaceChildren(new Option('Select a model', ''));
        models.forEach((model) => modelSelect.add(new Option(model.name, model.name)));
        updateModelSelect.replaceChildren(new Option('Select a model', ''));
        models.forEach((model) => updateModelSelect.add(new Option(model.name, model.name)));
        contextSelect.replaceChildren(new Option('Select a DbContext', ''));
        contexts.forEach((context) => contextSelect.add(new Option(context.name, context.name)));
        databaseContextSelect.replaceChildren(new Option('Select a DbContext', ''));
        contexts.forEach((context) => databaseContextSelect.add(new Option(context.name, context.name)));
        apiEndpointSelect.replaceChildren(new Option(
            apiEndpoints.length ? 'Select an API endpoint' : 'No API endpoints found',
            ''
        ));
        apiEndpoints.forEach((endpoint) => {
            const value = `${endpoint.method} ${endpoint.route}`;
            apiEndpointSelect.add(new Option(value, value));
        });
        if (apiEndpoints.some((endpoint) => `${endpoint.method} ${endpoint.route}` === previousApiEndpoint)) {
            apiEndpointSelect.value = previousApiEndpoint;
        }
        apiEndpointHelp.textContent = apiEndpoints.length
            ? `${apiEndpoints.length} endpoint${apiEndpoints.length === 1 ? '' : 's'} detected in this project.`
            : 'No API endpoints found. Add API controller routes or minimal API mappings.';

        if (models.some((model) => model.name === previousModel)) {
            modelSelect.value = previousModel;
        }
        if (models.some((model) => model.name === previousUpdateModel)) {
            updateModelSelect.value = previousUpdateModel;
        }
        if (contexts.some((context) => context.name === previousContext)) {
            contextSelect.value = previousContext;
        }
        if (contexts.some((context) => context.name === previousDatabaseContext)) {
            databaseContextSelect.value = previousDatabaseContext;
        } else if (contextSelect.value) {
            databaseContextSelect.value = contextSelect.value;
        } else if (contexts.length === 1) {
            databaseContextSelect.value = contexts[0].name;
        }
        if (!contextSelect.value && contexts.length === 1) {
            contextSelect.value = contexts[0].name;
        }
        mvcHelp.textContent = models.length && contexts.length
            ? 'Choose the model and Entity Framework context for CRUD generation.'
            : 'MVC CRUD needs an existing model with an Id property and an Entity Framework DbContext.';
        updateControls();
        refreshDatabaseStatus();
    }

    function refreshDatabaseStatus() {
        const projectDirectory = projectSelect.value;
        const contextName = databaseContextSelect.value;
        const project = projects.find((item) => item.directory === projectDirectory);
        databaseConfigured = false;
        databaseContextHelp.textContent = project && project.dbContexts.length === 0
            ? 'No DbContext found. Create a starter one to continue.'
            : 'Choose the EF Core DbContext used by your app.';
        if (!projectDirectory || !contextName) {
            databaseSummary.textContent = project && project.dbContexts.length === 0
                ? 'Create a starter DbContext to connect.'
                : 'Select a context and connect to PostgreSQL.';
            updateControls();
            return;
        }

        databaseSummary.textContent = 'Checking saved connection…';
        vscode.postMessage({ command: 'databaseStatus', projectDirectory, contextName });
    }

    function post(command, data = {}) {
        const projectDirectory = projectSelect.value;
        if (command !== 'refresh' && !projectDirectory) {
            setStatus('Choose a project before continuing.', 'error');
            return;
        }

        isBusy = true;
        setStatus(
            command === 'refresh' ? 'Looking for .NET projects…' :
                command === 'scaffold' ? 'Creating your file…' :
                    command === 'connectDatabase' ? 'Connecting to PostgreSQL and applying migrations…' :
                    `${command[0].toUpperCase()}${command.slice(1)} in progress…`,
            'busy'
        );
        updateControls();
        vscode.postMessage({
            command,
            projectDirectory,
            contextName: databaseContextSelect.value,
            ...data
        });
    }

    refreshButton.addEventListener('click', () => post('refresh'));
    openFolderButton.addEventListener('click', () => vscode.postMessage({ command: 'openFolder' }));
    createDbContextButton.addEventListener('click', () => {
        const project = projects.find((item) => item.directory === projectSelect.value);
        if (!project) {
            setStatus('Select a project before creating a DbContext.', 'error');
            return;
        }

        const projectName = project.name.replace(/[^A-Za-z0-9_]/g, '') || 'App';
        const contextName = `${/^[A-Za-z_]/.test(projectName) ? '' : 'App'}${projectName}DbContext`;
        post('scaffold', { type: 'dbContext', name: contextName });
    });

    commandButtons.forEach((button) => {
        button.addEventListener('click', () => post(button.dataset.command));
    });
    stopProcessButton.addEventListener('click', () => {
        if (activeProcess) {
            post('stopProcess', { projectDirectory: activeProcess.projectDirectory });
        }
    });

    function createScaffold() {
        const isMvc = scaffoldType.value === 'mvc';
        const isModelUpdate = scaffoldType.value === 'updateModel';
        if (isMvc && (!modelSelect.value || !contextSelect.value)) {
            setStatus('Select a model and DbContext for MVC CRUD.', 'error');
            return;
        }
        if (isModelUpdate
            && (!updateModelSelect.value || !propertyNameInput.value.trim() || !propertyTypeInput.value.trim())) {
            setStatus('Choose a model and enter the new property name and type.', 'error');
            return;
        }
        if (!isMvc && !isModelUpdate && !nameInput.value.trim()) {
            nameInput.focus();
            setStatus('Enter a name for the generated file.', 'error');
            return;
        }

        if (isModelUpdate) {
            post('scaffold', {
                type: 'updateModel',
                modelName: updateModelSelect.value,
                propertyName: propertyNameInput.value.trim(),
                propertyType: propertyTypeInput.value.trim(),
                contextName: databaseContextSelect.value
            });
            return;
        }
        post('scaffold', {
            type: scaffoldType.value,
            name: nameInput.value.trim(),
            modelName: modelSelect.value,
            contextName: scaffoldType.value === 'mvc' ? contextSelect.value : databaseContextSelect.value
        });
    }

    function connectDatabase() {
        post('connectDatabase', {
            contextName: databaseContextSelect.value,
            connection: {
                host: databaseHost.value,
                port: databasePort.value,
                database: databaseName.value,
                username: databaseUsername.value,
                password: databasePassword.value
            }
        });
    }

    createButton.addEventListener('click', createScaffold);
    connectDatabaseButton.addEventListener('click', connectDatabase);
    nameInput.addEventListener('input', updateControls);
    nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !createButton.disabled) {
            createScaffold();
        }
    });
    scaffoldType.addEventListener('change', () => {
        nameHelp.textContent = hints[scaffoldType.value] || hints.model;
        populateMvcOptions();
    });
    projectSelect.addEventListener('change', populateMvcOptions);
    modelSelect.addEventListener('change', updateControls);
    updateModelSelect.addEventListener('change', updateControls);
    propertyNameInput.addEventListener('input', updateControls);
    propertyTypeInput.addEventListener('input', updateControls);
    contextSelect.addEventListener('change', () => {
        databaseContextSelect.value = contextSelect.value;
        refreshDatabaseStatus();
    });
    databaseContextSelect.addEventListener('change', refreshDatabaseStatus);
    databaseInputs.forEach((input) => input.addEventListener('input', updateControls));

    window.addEventListener('message', (event) => {
        const message = event.data;

        if (message.command === 'busy') {
            isBusy = true;
            setStatus(message.message, 'busy');
            updateControls();
            return;
        }

        if (message.command === 'started') {
            isBusy = false;
            activeProcesses.set(message.projectDirectory, {
                command: message.processCommand,
                projectDirectory: message.projectDirectory
            });
            activeProcess = activeProcesses.get(projectSelect.value);
            setStatus(message.message, 'success');
            updateControls();
            return;
        }

        if (message.command === 'processExit') {
            isBusy = false;
            activeProcesses.delete(message.projectDirectory);
            activeProcess = activeProcesses.get(projectSelect.value);
            setStatus(
                message.message,
                message.stopped || (!message.failed && message.code === 0) ? 'success' : 'error'
            );
            updateControls();
            return;
        }

        if (message.command === 'processState') {
            activeProcesses.clear();
            message.processes.forEach((process) => activeProcesses.set(process.projectDirectory, process));
            activeProcess = activeProcesses.get(projectSelect.value);
            updateControls();
            return;
        }

        if (message.command === 'databaseStatus') {
            if (message.projectDirectory !== projectSelect.value
                || message.contextName !== databaseContextSelect.value) {
                return;
            }
            databaseConfigured = Boolean(message.configured);
            databaseSummary.textContent = databaseConfigured
                ? `Connected · ${message.contextName}`
                : 'Not connected · credentials are saved securely after connecting.';
            updateControls();
            return;
        }

        if (message.command === 'projects') {
            const previousProject = projectSelect.value;
            projects = message.projects;
            projectSelect.replaceChildren();

            if (projects.length === 0) {
                projectSelect.add(new Option('No .NET projects found', ''));
                projectHelp.textContent = message.emptyMessage ||
                    'Open a workspace with a .csproj file, then refresh.';
                projectCount.hidden = true;
            } else {
                projects.forEach((project) => {
                    const framework = project.targetFramework ? ` · ${project.targetFramework}` : '';
                    projectSelect.add(new Option(`${project.name}${framework}`, project.directory));
                });
                projectSelect.value = projects.some((project) => project.directory === previousProject)
                    ? previousProject
                    : message.projects[0].directory;
                projectHelp.textContent = 'Commands will run against the selected project.';
                projectCount.textContent = String(message.projects.length);
                projectCount.hidden = false;
            }

            hasWorkspace = Boolean(message.hasWorkspace);
            isBusy = false;
            populateMvcOptions();
            if (preserveStatusOnRefresh) {
                preserveStatusOnRefresh = false;
            } else {
                setStatus(
                    message.projects.length
                        ? `${message.projects.length} project${message.projects.length === 1 ? '' : 's'} ready.`
                        : message.emptyMessage || 'No .NET projects found.',
                    message.projects.length ? 'success' : 'idle'
                );
            }
            updateControls();
            return;
        }

        if (message.command === 'success') {
            isBusy = false;
            setStatus(message.message, 'success');
            if (message.updatedModel) {
                propertyNameInput.value = '';
            }
            if (message.createdFiles) {
                nameInput.value = '';
                post('refresh');
                return;
            }
            if (message.databaseConfigured) {
                databaseConfigured = true;
                databasePassword.value = '';
                databaseSummary.textContent = `Connected · ${databaseContextSelect.value}`;
            }
            updateControls();
            return;
        }

        if (message.command === 'error') {
            isBusy = false;
            const failedProcess = activeProcesses.get(message.projectDirectory);
            if (failedProcess?.starting) {
                activeProcesses.delete(message.projectDirectory);
            }
            if (message.createdFiles) {
                nameInput.value = '';
            }
            setStatus(message.message, 'error');
            updateControls();
            if (message.refreshProjects) {
                preserveStatusOnRefresh = true;
                vscode.postMessage({ command: 'refresh' });
            }
        }
    });

    updateControls();
    vscode.postMessage({ command: 'ready' });
    post('refresh');
})();
