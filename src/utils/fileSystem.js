'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const IGNORED_DIRECTORIES = new Set(['.git', '.vs', 'bin', 'node_modules', 'obj']);

async function ensureDirectory(directoryPath) {
    await fs.mkdir(directoryPath, { recursive: true });
    return directoryPath;
}

async function writeFileIfAbsent(filePath, contents) {
    await ensureDirectory(path.dirname(filePath));
    try {
        await fs.writeFile(filePath, contents, { encoding: 'utf8', flag: 'wx' });
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') {
            return false;
        }
        throw error;
    }
}

async function findFiles(rootPath, predicate, options = {}) {
    const ignoredDirectories = new Set([
        ...IGNORED_DIRECTORIES,
        ...(options.ignoredDirectories || [])
    ]);
    const matches = [];

    async function visit(directoryPath) {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
            const entryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                if (!ignoredDirectories.has(entry.name)) {
                    await visit(entryPath);
                }
            } else if (entry.isFile() && predicate(entryPath, entry)) {
                matches.push(entryPath);
            }
        }
    }

    await visit(rootPath);
    return matches;
}

module.exports = {
    ensureDirectory,
    writeFileIfAbsent,
    findFiles
};
