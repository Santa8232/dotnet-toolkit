'use strict';

const path = require('node:path');

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function requireNonEmptyString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string.`);
    }

    return value.trim();
}

function validateIdentifier(value, label = 'Name') {
    const identifier = requireNonEmptyString(value, label);
    if (!IDENTIFIER_PATTERN.test(identifier)) {
        throw new TypeError(`${label} must be a valid C# identifier.`);
    }

    return identifier;
}

function validateProjectDirectory(projectDirectory, workspaceRoot) {
    const projectPath = path.resolve(requireNonEmptyString(projectDirectory, 'Project directory'));
    if (workspaceRoot) {
        const rootPath = path.resolve(requireNonEmptyString(workspaceRoot, 'Workspace root'));
        const relativePath = path.relative(rootPath, projectPath);
        if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
            throw new TypeError('Project directory must be inside the workspace.');
        }
    }

    return projectPath;
}

function validateHttpUrl(value, label = 'URL') {
    const input = requireNonEmptyString(value, label);
    let url;
    try {
        url = new URL(input);
    } catch (error) {
        throw new TypeError(`${label} must be a valid HTTP or HTTPS URL.`, { cause: error });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new TypeError(`${label} must use HTTP or HTTPS.`);
    }

    return url;
}

module.exports = {
    requireNonEmptyString,
    validateIdentifier,
    validateProjectDirectory,
    validateHttpUrl
};
