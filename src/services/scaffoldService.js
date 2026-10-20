'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { writeFileIfAbsent } = require('../utils/fileSystem');
const { validateIdentifier, validateProjectDirectory } = require('../utils/validation');
const { discoverMvcArtifacts, findProjectFile } = require('./projectService');
const { generateMvc } = require('../generators/mvcGenerator');
const { generateApi } = require('../generators/apiGenerator');
const { generateModel } = require('../generators/modelGenerator');
const { generateDbContext } = require('../generators/dbContextGenerator');
const { addModelToContext } = require('./databaseService');

const GENERATORS = {
    mvc: (options) => options.mvcFiles,
    api: (options) => [generateApi(options.name)],
    model: (options) => [{
        path: `Models/${options.name}.cs`,
        content: generateModel(options.name, options.properties)
    }],
    dbContext: (options) => [{
        path: `Data/${options.name}.cs`,
        content: generateDbContext(options.name, options.models)
    }]
};

async function scaffold(options) {
    if (!options || typeof options !== 'object') {
        throw new TypeError('Scaffold options are required.');
    }

    const projectDirectory = validateProjectDirectory(options.projectDirectory, options.workspaceRoot);
    const name = validateIdentifier(
        options.name || (options.type === 'mvc' ? options.modelName : ''),
        'Name'
    );
    const generator = GENERATORS[options.type];
    if (!generator) {
        throw new TypeError(`Unsupported scaffold type: ${options.type}`);
    }

    const projectFile = await findProjectFile(projectDirectory);
    let generatorOptions = { ...options, name };
    let mvcArtifacts;
    if (options.type === 'mvc') {
        mvcArtifacts = await discoverMvcArtifacts(projectDirectory);
        const model = mvcArtifacts.models.find((item) => item.name === options.modelName);
        const context = mvcArtifacts.dbContexts.find((item) => item.name === options.contextName);
        if (!model) {
            throw new Error('Choose an existing model with an Id property before generating MVC CRUD.');
        }
        if (!context) {
            throw new Error('Choose an existing Entity Framework DbContext before generating MVC CRUD.');
        }
        const projectContents = await fs.readFile(projectFile, 'utf8');
        const rootNamespace = projectContents.match(/<RootNamespace>([^<]+)<\/RootNamespace>/i)?.[1].trim()
            || path.basename(projectDirectory).replace(/[^A-Za-z0-9_]/g, '_');

        generatorOptions.mvcFiles = generateMvc({
            modelName: model.name,
            modelNamespace: model.namespace,
            modelProperties: model.properties,
            contextName: context.name,
            contextNamespace: context.namespace,
            controllerNamespace: `${rootNamespace}.Controllers`
        });
    }
    const files = generator(generatorOptions);
    const targets = files.map((file) => path.resolve(projectDirectory, file.path));
    if (targets.some((target) => {
        const relativePath = path.relative(projectDirectory, target);
        return relativePath.startsWith('..') || path.isAbsolute(relativePath);
    })) {
        throw new TypeError('Generated files must stay inside the project directory.');
    }

    const existing = [];
    for (const target of targets) {
        try {
            await fs.access(target);
            existing.push(target);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    if (existing.length) {
        throw new Error(`Refusing to overwrite existing file: ${existing[0]}`);
    }

    const created = [];
    const originalContext = mvcArtifacts
        ? await fs.readFile(
            mvcArtifacts.dbContexts.find((item) => item.name === options.contextName).path,
            'utf8'
        )
        : undefined;
    let contextUpdated = false;
    try {
        for (let index = 0; index < files.length; index += 1) {
            const didWrite = await writeFileIfAbsent(targets[index], files[index].content);
            if (!didWrite) {
                throw new Error(`Refusing to overwrite existing file: ${targets[index]}`);
            }
            created.push(targets[index]);
        }
        if (mvcArtifacts) {
            const model = mvcArtifacts.models.find((item) => item.name === options.modelName);
            const context = mvcArtifacts.dbContexts.find((item) => item.name === options.contextName);
            contextUpdated = await addModelToContext(context, model);
        }
    } catch (error) {
        const cleanup = created.map((filePath) => fs.unlink(filePath));
        if (contextUpdated) {
            const context = mvcArtifacts.dbContexts.find((item) => item.name === options.contextName);
            cleanup.push(fs.writeFile(context.path, originalContext, 'utf8'));
        }
        await Promise.all(cleanup);
        throw error;
    }

    return created;
}

module.exports = { scaffold };
