'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { findFiles } = require('../utils/fileSystem');
const { requireNonEmptyString } = require('../utils/validation');

async function discoverProjects(workspaceRoot) {
    const rootPath = path.resolve(requireNonEmptyString(workspaceRoot, 'Workspace root'));
    const projectFiles = await findFiles(rootPath, (filePath) => path.extname(filePath).toLowerCase() === '.csproj');
    const projects = await Promise.all(projectFiles.map(async (projectFile) => {
        const contents = await fs.readFile(projectFile, 'utf8');
        const targetFramework = contents.match(/<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/i);
        const rootNamespace = contents.match(/<RootNamespace>([^<]+)<\/RootNamespace>/i);
        const artifacts = await discoverMvcArtifacts(path.dirname(projectFile));
        const apiEndpoints = await discoverApiEndpoints(path.dirname(projectFile));
        return {
            name: path.parse(projectFile).name,
            path: projectFile,
            directory: path.dirname(projectFile),
            targetFramework: targetFramework ? targetFramework[1].trim() : null,
            rootNamespace: rootNamespace ? rootNamespace[1].trim() : path.parse(projectFile).name.replace(/[^A-Za-z0-9_]/g, '_'),
            models: artifacts.models,
            dbContexts: artifacts.dbContexts,
            apiEndpoints
        };
    }));

    return projects;
}

async function discoverMvcArtifacts(projectDirectory) {
    const sourceFiles = await findFiles(
        projectDirectory,
        (filePath) => path.extname(filePath).toLowerCase() === '.cs'
    );
    const models = [];
    const dbContexts = [];

    for (const filePath of sourceFiles) {
        const contents = await fs.readFile(filePath, 'utf8');
        const namespace = extractNamespace(contents);
        const declarations = [...contents.matchAll(/\b(public\s+)?(abstract\s+)?class\s+([A-Za-z_]\w*)(?:\s*:\s*([^{\r\n]+))?/g)];

        for (const declaration of declarations) {
            const className = declaration[3];
            const baseTypes = declaration[4] || '';
            if (/\b(?:DbContext|IdentityDbContext)(?:\b|<)/.test(baseTypes)) {
                dbContexts.push({ name: className, namespace, path: filePath });
                continue;
            }
            if (!declaration[1] || declaration[2] || /Controller$/.test(className)) {
                continue;
            }

            const properties = [...contents.matchAll(/((?:\[[^\]]+\]\s*)*)public\s+([A-Za-z_][\w.<>,?\[\]]*)\s+([A-Za-z_]\w*)\s*\{\s*get\s*;\s*set\s*;\s*\}/g)]
                .map((match) => ({
                    type: match[2],
                    name: match[3],
                    isScalar: isScalarType(match[2]),
                    isKey: match[1].includes('[Key]') || match[3] === 'Id' || match[3] === `${className}Id`
                }));
            if (properties.some((property) => property.isKey)) {
                models.push({ name: className, namespace, path: filePath, properties });
            }
        }
    }

    return {
        models: uniqueByName(models),
        dbContexts: uniqueByName(dbContexts)
    };
}

async function discoverApiEndpoints(projectDirectory) {
    const sourceFiles = await findFiles(
        projectDirectory,
        (filePath) => path.extname(filePath).toLowerCase() === '.cs'
    );
    const endpoints = [];

    for (const filePath of sourceFiles) {
        const contents = await fs.readFile(filePath, 'utf8');
        const classMatches = [...contents.matchAll(/\bclass\s+([A-Za-z_]\w*)(?:\s*:\s*([^{\r\n]+))?/g)];

        for (let index = 0; index < classMatches.length; index += 1) {
            const classMatch = classMatches[index];
            const controllerName = classMatch[1];
            const previousClassEnd = contents.lastIndexOf('}', classMatch.index - 1);
            const declarationPrefix = contents.slice(previousClassEnd + 1, classMatch.index);
            const isApiController = /\bControllerBase\b/.test(classMatch[2] || '')
                || /\[\s*ApiController\s*\]/.test(declarationPrefix);
            if (!isApiController) {
                continue;
            }

            const classContents = contents.slice(
                classMatch.index,
                classMatches[index + 1]?.index ?? contents.length
            );
            const classRoute = getAttributeRoute(declarationPrefix);
            const routeAttributes = /\[\s*Http(Get|Post|Put|Delete|Patch|Head|Options)\b([^\]]*)\]/g;
            let routeAttribute;
            while ((routeAttribute = routeAttributes.exec(classContents)) !== null) {
                const method = routeAttribute[1].toUpperCase();
                const routeArgument = routeAttribute[2].match(/\(\s*"([^"]*)"/);
                const actionContents = classContents.slice(routeAttributes.lastIndex);
                const nextAttribute = actionContents.search(/\[\s*Http(?:Get|Post|Put|Delete|Patch|Head|Options)\b/);
                const actionDeclaration = nextAttribute === -1
                    ? actionContents
                    : actionContents.slice(0, nextAttribute);
                const actionName = actionDeclaration.match(
                    /\b(?:public|protected|internal|private)\s+(?:(?:static|async|virtual|override)\s+)*[\w.<>,?\[\]]+\s+([A-Za-z_]\w*)\s*\(/
                )?.[1] || '';
                const route = combineRouteTemplates(
                    classRoute.replace(/\[controller\]/gi, controllerName.replace(/Controller$/, '')),
                    routeArgument ? routeArgument[1] : ''
                ).replace(/\[action\]/gi, actionName);
                endpoints.push({ method, route, path: filePath });
            }
        }

        const minimalRoutes = /\.\s*Map(Get|Post|Put|Delete|Patch|Head|Options)\s*\(\s*"([^"]+)"/g;
        let minimalRoute;
        while ((minimalRoute = minimalRoutes.exec(contents)) !== null) {
            endpoints.push({
                method: minimalRoute[1].toUpperCase(),
                route: combineRouteTemplates('', minimalRoute[2]),
                path: filePath
            });
        }
    }

    const seen = new Set();
    return endpoints.filter((endpoint) => {
        const key = `${endpoint.method} ${endpoint.route}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function getAttributeRoute(contents) {
    return contents.match(/\[\s*Route\s*\(\s*"([^"]*)"/)?.[1] || '';
}

function combineRouteTemplates(prefix, template) {
    if (template.startsWith('~/') || template.startsWith('/')) {
        return `/${template.replace(/^~?\/+/, '')}`;
    }
    const segments = [prefix, template].filter(Boolean).map((part) => part.replace(/^\/+|\/+$/g, ''));
    return `/${segments.join('/')}`;
}

function extractNamespace(contents) {
    const namespace = contents.match(/^\s*namespace\s+([A-Za-z_][\w.]*)\s*;/m)
        || contents.match(/^\s*namespace\s+([A-Za-z_][\w.]*)\s*\{/m);
    return namespace ? namespace[1] : '';
}

function isScalarType(type) {
    return /^(string|bool|byte|sbyte|short|ushort|int|uint|long|ulong|float|double|decimal|char|DateTime|DateTimeOffset|Guid)(\?)?$/.test(type)
        || /^(string|bool|byte|sbyte|short|ushort|int|uint|long|ulong|float|double|decimal|char|DateTime|DateTimeOffset|Guid)\[\]$/.test(type);
}

function uniqueByName(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.name)) {
            return false;
        }
        seen.add(item.name);
        return true;
    });
}

async function findProjectFile(projectDirectory) {
    const directory = path.resolve(requireNonEmptyString(projectDirectory, 'Project directory'));
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const projectFiles = entries
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.csproj')
        .map((entry) => path.join(directory, entry.name))
        .sort();

    if (projectFiles.length === 0) {
        throw new Error(`No .csproj file was found in ${directory}.`);
    }
    if (projectFiles.length > 1) {
        throw new Error(`More than one .csproj file was found in ${directory}.`);
    }

    return projectFiles[0];
}

module.exports = {
    discoverProjects,
    discoverMvcArtifacts,
    discoverApiEndpoints,
    findProjectFile
};
