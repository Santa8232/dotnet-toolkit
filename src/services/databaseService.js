'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { findFiles } = require('../utils/fileSystem');
const { validateIdentifier } = require('../utils/validation');
const { findProjectFile } = require('./projectService');
const { executeDotnet } = require('./dotnetService');

const CONNECTION_ENVIRONMENT_VARIABLE = 'DOTNET_TOOLKIT_CONNECTION_STRING';
const POSTGRES_PACKAGE = 'Npgsql.EntityFrameworkCore.PostgreSQL';
const DESIGN_PACKAGE = 'Microsoft.EntityFrameworkCore.Design';

function createPostgresConnectionString(options) {
    const host = requiredField(options.host, 'Host');
    const database = requiredField(options.database, 'Database');
    const username = requiredField(options.username, 'Username');
    const password = requiredField(options.password, 'Password', false);
    const port = Number(options.port || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new TypeError('Port must be a number between 1 and 65535.');
    }

    return [
        `Host=${quoteConnectionValue(host)}`,
        `Port=${port}`,
        `Database=${quoteConnectionValue(database)}`,
        `Username=${quoteConnectionValue(username)}`,
        `Password=${quoteConnectionValue(password)}`,
        'Include Error Detail=false'
    ].join(';');
}

function getConnectionSecretKey(projectDirectory, contextName) {
    const resolvedPath = path.resolve(projectDirectory);
    const projectPath = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    const context = requiredField(contextName, 'DbContext');
    const hash = crypto.createHash('sha256').update(`${projectPath}\0${context}`).digest('hex');
    return `dotnet-toolkit.postgres.${hash}`;
}

async function connectAndUpdate(options) {
    const projectFile = await findProjectFile(options.projectDirectory);
    const context = options.context;
    if (!context || !context.name || !context.path) {
        throw new TypeError('Choose a discovered Entity Framework DbContext.');
    }

    const connectionString = createPostgresConnectionString(options.connection);
    const projectDirectory = path.dirname(projectFile);
    const efMajor = await ensurePackages(projectFile, projectDirectory);
    await ensureEfTool(projectDirectory, efMajor);
    const programFile = await configureProject(projectDirectory, context);

    const environment = {
        [CONNECTION_ENVIRONMENT_VARIABLE]: connectionString
    };
    const createdInitialMigration = await applyMigrations({
        projectFile,
        projectDirectory,
        contextName: context.name,
        environment
    });

    return {
        programFile,
        createdInitialMigration,
        secretKey: getConnectionSecretKey(projectDirectory, context.name)
    };
}

async function addModelAndUpdate(options, runDotnet = executeDotnet) {
    const projectFile = await findProjectFile(options.projectDirectory);
    const context = options.context;
    if (!context || !context.name || !context.path) {
        throw new TypeError('Choose an Entity Framework DbContext before generating a database model.');
    }

    const projectDirectory = path.dirname(projectFile);
    await addModelToContext(context, options.model);
    const migrationName = `Toolkit_Add_${options.model.name}_${Date.now()}`;
    await createAndApplyMigration({
        projectFile,
        projectDirectory,
        contextName: context.name,
        connectionString: options.connectionString,
        migrationName
    }, runDotnet);

    return migrationName;
}

async function updateModelAndUpdate(options, runDotnet = executeDotnet) {
    const projectFile = await findProjectFile(options.projectDirectory);
    const context = options.context;
    const model = options.model;
    if (!context || !context.name || !context.path) {
        throw new TypeError('Choose an Entity Framework DbContext before updating a database model.');
    }
    if (!model || !model.name || !model.path) {
        throw new TypeError('Choose a discovered model before updating its database table.');
    }

    const propertyName = validateIdentifier(options.propertyName, 'Property name');
    const propertyType = validateModelPropertyType(options.propertyType);
    const projectDirectory = path.dirname(projectFile);
    const originalModel = await fs.readFile(model.path, 'utf8');
    const originalContext = await fs.readFile(context.path, 'utf8');
    const migrationName = `Toolkit_Update_${model.name}_${Date.now()}`;

    await addPropertyToModel(model, propertyName, propertyType);
    try {
        await addModelToContext(context, model);
        await createAndApplyMigration({
            projectFile,
            projectDirectory,
            contextName: context.name,
            connectionString: options.connectionString,
            migrationName
        }, runDotnet);
    } catch (error) {
        if (error.migrationCreated) {
            error.migrationName = migrationName;
            throw error;
        }
        await Promise.all([
            fs.writeFile(model.path, originalModel, 'utf8'),
            fs.writeFile(context.path, originalContext, 'utf8')
        ]);
        throw error;
    }

    return migrationName;
}

async function createAndApplyMigration(options, runDotnet) {
    const environment = {
        [CONNECTION_ENVIRONMENT_VARIABLE]: options.connectionString
    };
    const commandOptions = { cwd: options.projectDirectory, env: environment };

    try {
        await runDotnet(
            [
                'ef', 'migrations', 'add', options.migrationName,
                '--context', options.contextName,
                '--project', options.projectFile,
                '--startup-project', options.projectFile
            ],
            commandOptions
        );
    } catch (error) {
        if (/Build failed\. Use dotnet build to see the errors/i.test(error.message)) {
            let detail;
            try {
                const build = await runDotnet(['build', options.projectFile], commandOptions);
                detail = `${build.stdout || ''}\n${build.stderr || ''}`.trim()
                    || 'dotnet build completed without reporting compiler diagnostics.';
            } catch (buildError) {
                detail = buildError.message;
            }
            throw new Error(`${error.message}\n\nBuild diagnostics:\n${detail}`, { cause: error });
        }
        throw error;
    }

    try {
        await runDotnet(
            [
                'ef', 'database', 'update',
                '--context', options.contextName,
                '--project', options.projectFile,
                '--startup-project', options.projectFile
            ],
            { cwd: options.projectDirectory, env: environment }
        );
    } catch (error) {
        error.migrationCreated = true;
        throw error;
    }
}

async function addPropertyToModel(model, propertyName, propertyType) {
    const source = await fs.readFile(model.path, 'utf8');
    const classMatch = new RegExp(`\\bclass\\s+${escapeRegExp(model.name)}\\b`).exec(source);
    if (!classMatch) {
        throw new Error(`Could not locate model class ${model.name} in ${model.path}.`);
    }

    const openingBrace = source.indexOf('{', classMatch.index + classMatch[0].length);
    const closingBrace = findMatchingBrace(source, openingBrace);
    if (openingBrace < 0 || closingBrace < 0) {
        throw new Error(`Could not safely edit model class ${model.name}.`);
    }

    const classBody = source.slice(openingBrace + 1, closingBrace);
    const propertyPattern = new RegExp(`\\b${escapeRegExp(propertyName)}\\b`);
    if (propertyPattern.test(classBody)) {
        throw new Error(`Model ${model.name} already contains a member named ${propertyName}.`);
    }

    const existingProperty = classBody.match(/^[ \t]+(?=public\b)/m);
    const indentation = existingProperty ? existingProperty[0] : '    ';
    const initializer = getPropertyInitializer(propertyType);
    const property = `${indentation}public ${propertyType} ${propertyName} { get; set; }${initializer}`;
    const separator = classBody.trim() ? '\n' : '';
    const updated = `${source.slice(0, closingBrace)}${separator}${property}\n${source.slice(closingBrace)}`;
    await fs.writeFile(model.path, updated, 'utf8');
}

function getPropertyInitializer(type) {
    if (type === 'string') {
        return ' = string.Empty;';
    }
    if (type.endsWith('[]') && !type.endsWith('?')) {
        const elementType = type.slice(0, -2);
        return ` = global::System.Array.Empty<${elementType}>();`;
    }

    return ';';
}

function validateModelPropertyType(type) {
    if (typeof type !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.]*(\[\])?(\?)?$/.test(type)) {
        throw new TypeError('Property type must be a valid C# type name.');
    }
    return type;
}

async function applyMigrations(options, runDotnet = executeDotnet) {
    const commonArgs = [
        '--context', options.contextName,
        '--project', options.projectFile,
        '--startup-project', options.projectFile
    ];
    const commandOptions = { cwd: options.projectDirectory, env: options.environment };
    const migrations = await runDotnet(['ef', 'migrations', 'list', ...commonArgs], commandOptions);
    const createdInitialMigration = /no migrations? (?:were|was) found/i.test(
        `${migrations.stdout}\n${migrations.stderr}`
    );

    if (createdInitialMigration) {
        await runDotnet([
            'ef', 'migrations', 'add', 'Toolkit_Initial',
            ...commonArgs
        ], commandOptions);
    }

    await runDotnet(['ef', 'database', 'update', ...commonArgs], commandOptions);
    return createdInitialMigration;
}

async function configureProject(projectDirectory, context) {
    const programFiles = await findFiles(
        projectDirectory,
        (filePath) => path.basename(filePath).toLowerCase() === 'program.cs'
    );
    if (programFiles.length !== 1) {
        throw new Error('PostgreSQL setup needs exactly one Program.cs in the selected project.');
    }

    const programFile = programFiles[0];
    let source = await fs.readFile(programFile, 'utf8');
    const registration = createRegistration(context);
    const registrationPattern = new RegExp(
        `builder\\.Services\\.AddDbContext\\s*<\\s*${escapeRegExp(context.name)}\\s*>\\s*\\([^;]*\\);`,
        's'
    );

    if (registrationPattern.test(source)) {
        source = source.replace(registrationPattern, registration);
    } else {
        const anyRegistration = new RegExp(
            `\\.AddDbContext\\s*<\\s*${escapeRegExp(context.name)}\\s*>\\s*\\(`
        );
        if (anyRegistration.test(source)) {
            throw new Error(`Found a custom ${context.name} registration. Update it to use PostgreSQL before applying migrations.`);
        }

        const buildMarker = /\bvar\s+app\s*=\s*builder\.Build\s*\(\s*\)\s*;/;
        if (!buildMarker.test(source)) {
            throw new Error('Could not safely locate "var app = builder.Build();" in Program.cs to configure PostgreSQL.');
        }
        source = source.replace(buildMarker, `${registration}\n\n$&`);
    }

    source = addUsing(source, 'System');
    source = addUsing(source, 'Microsoft.EntityFrameworkCore');
    if (context.namespace) {
        source = addUsing(source, context.namespace);
    }

    await fs.writeFile(programFile, source, 'utf8');
    return programFile;
}

function createRegistration(context) {
    return `builder.Services.AddDbContext<${context.name}>(options =>
    options.UseNpgsql(Environment.GetEnvironmentVariable("${CONNECTION_ENVIRONMENT_VARIABLE}")
        ?? throw new InvalidOperationException("Connect the database through the .NET Toolkit first.")));`;
}

async function addModelToContext(context, model) {
    if (!model || !model.name || !model.path) {
        throw new TypeError('Choose a discovered model before adding its database table.');
    }
    if (context.path === model.path) {
        throw new Error('The model and DbContext must be in separate source files.');
    }

    const source = await fs.readFile(context.path, 'utf8');
    const propertyPattern = new RegExp(`\\bDbSet\\s*<\\s*${escapeRegExp(model.name)}\\s*>`);
    if (propertyPattern.test(source)) {
        return false;
    }

    const classMatch = new RegExp(`\\bclass\\s+${escapeRegExp(context.name)}\\b`).exec(source);
    if (!classMatch) {
        throw new Error(`Could not locate DbContext class ${context.name} in ${context.path}.`);
    }
    const openingBrace = source.indexOf('{', classMatch.index + classMatch[0].length);
    const closingBrace = findMatchingBrace(source, openingBrace);
    if (openingBrace < 0 || closingBrace < 0) {
        throw new Error(`Could not safely edit DbContext class ${context.name}.`);
    }

    let updated = `${source.slice(0, closingBrace)}    public DbSet<${model.name}> ${model.name}s { get; set; } = null!;\n${source.slice(closingBrace)}`;
    updated = addUsing(updated, 'Microsoft.EntityFrameworkCore');
    if (model.namespace) {
        updated = addUsing(updated, model.namespace);
    }
    await fs.writeFile(context.path, updated, 'utf8');
    return true;
}

async function ensurePackages(projectFile, projectDirectory) {
    let contents = await fs.readFile(projectFile, 'utf8');
    const major = getEntityFrameworkMajor(contents) || getTargetFrameworkMajor(contents);
    const version = major ? `${major}.*` : undefined;
    const packages = [
        [POSTGRES_PACKAGE, hasPackage(contents, POSTGRES_PACKAGE)],
        [DESIGN_PACKAGE, hasPackage(contents, DESIGN_PACKAGE)]
    ];

    for (const [packageName, installed] of packages) {
        if (!installed) {
            const args = ['add', projectFile, 'package', packageName];
            if (version) {
                args.push('--version', version);
            }
            await executeDotnet(args, { cwd: projectDirectory });
            contents = await fs.readFile(projectFile, 'utf8');
        }
    }
    return major;
}

async function ensureEfTool(projectDirectory, majorVersion) {
    try {
        await executeDotnet(['ef', '--version'], { cwd: projectDirectory });
        return;
    } catch (error) {
        if (!/dotnet-ef|command or file was not found|no executable found|could not execute/i.test(error.message)) {
            throw error;
        }
    }

    const manifest = path.join(projectDirectory, '.config', 'dotnet-tools.json');
    try {
        await fs.access(manifest);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        await executeDotnet(['new', 'tool-manifest'], { cwd: projectDirectory });
    }

    const args = ['tool', 'install', 'dotnet-ef', '--local'];
    if (majorVersion) {
        args.push('--version', `${majorVersion}.*`);
    }
    await executeDotnet(args, { cwd: projectDirectory });
}

function getEntityFrameworkMajor(projectContents) {
    const versions = [...projectContents.matchAll(/<(?:PackageReference|PackageVersion)\b[^>]*>/gi)]
        .filter((match) => /Include=["']Microsoft\.EntityFrameworkCore(?:\.[^"']+)?["']/i.test(match[0]))
        .map((match) => match[0].match(/Version=["'](\d+)\./i))
        .filter(Boolean)
        .map((match) => Number(match[1]));
    return versions.length ? Math.max(...versions) : null;
}

function getTargetFrameworkMajor(projectContents) {
    const frameworks = projectContents.match(/<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/i);
    if (!frameworks) {
        return null;
    }
    const versions = frameworks[1].split(';')
        .map((framework) => framework.trim().match(/^(?:net)?(\d+)(?:\.\d+)?$/i))
        .filter(Boolean)
        .map((match) => Number(match[1]));
    return versions.length ? Math.min(...versions) : null;
}

function hasPackage(projectContents, packageName) {
    const escapedName = escapeRegExp(packageName);
    return new RegExp(`<PackageReference\\b[^>]*Include=["']${escapedName}["']`, 'i').test(projectContents);
}

function addUsing(source, namespace) {
    const directive = `using ${namespace};`;
    if (new RegExp(`^\\s*using\\s+${escapeRegExp(namespace)}\\s*;`, 'm').test(source)) {
        return source;
    }

    const usingDirectives = [...source.matchAll(/^using\s+[^;]+;\s*$/gm)];
    if (usingDirectives.length) {
        const last = usingDirectives[usingDirectives.length - 1];
        const end = last.index + last[0].length;
        return `${source.slice(0, end)}\n${directive}${source.slice(end)}`;
    }

    return `${directive}\n${source}`;
}

function findMatchingBrace(source, openingBrace) {
    if (openingBrace < 0) {
        return -1;
    }
    let depth = 0;
    let state = 'code';

    for (let index = openingBrace; index < source.length; index += 1) {
        const current = source[index];
        const next = source[index + 1];

        if (state === 'line-comment') {
            if (current === '\n') state = 'code';
            continue;
        }
        if (state === 'block-comment') {
            if (current === '*' && next === '/') {
                state = 'code';
                index += 1;
            }
            continue;
        }
        if (state === 'string' || state === 'character') {
            if (current === '\\') {
                index += 1;
            } else if ((state === 'string' && current === '"') || (state === 'character' && current === "'")) {
                state = 'code';
            }
            continue;
        }
        if (current === '/' && next === '/') {
            state = 'line-comment';
            index += 1;
        } else if (current === '/' && next === '*') {
            state = 'block-comment';
            index += 1;
        } else if (current === '"') {
            state = 'string';
        } else if (current === "'") {
            state = 'character';
        } else if (current === '{') {
            depth += 1;
        } else if (current === '}' && --depth === 0) {
            return index;
        }
    }

    return -1;
}

function quoteConnectionValue(value) {
    if (/[\r\n\0]/.test(value)) {
        throw new TypeError('Connection fields cannot contain line breaks or null characters.');
    }
    return `"${value.replaceAll('"', '""')}"`;
}

function requiredField(value, label, trim = true) {
    if (typeof value !== 'string' || value.length === 0 || (trim && value.trim() === '')) {
        throw new TypeError(`${label} is required.`);
    }
    return trim ? value.trim() : value;
}

function sanitizeErrorMessage(error, sensitiveValues = []) {
    let message = error instanceof Error ? error.message : String(error);
    for (const sensitiveValue of sensitiveValues) {
        if (typeof sensitiveValue === 'string' && sensitiveValue.length > 0) {
            message = message.replaceAll(sensitiveValue, '[redacted]');
        }
    }
    return message.replace(/(?:Password|Pwd)\s*=\s*(?:"(?:[^"]|"")*"|[^;\s]*)/gi, 'Password=[redacted]');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    CONNECTION_ENVIRONMENT_VARIABLE,
    createPostgresConnectionString,
    getConnectionSecretKey,
    connectAndUpdate,
    addModelAndUpdate,
    updateModelAndUpdate,
    applyMigrations,
    addModelToContext,
    configureProject,
    ensurePackages,
    ensureEfTool,
    sanitizeErrorMessage
};
