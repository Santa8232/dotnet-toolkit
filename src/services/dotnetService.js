'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { requireNonEmptyString } = require('../utils/validation');
const { findProjectFile } = require('./projectService');

function executeDotnet(args, options = {}) {
    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
    const executable = options.executable || 'dotnet';

    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            shell: false,
            windowsHide: true
        });
        let stdout = '';
        let stderr = '';

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.once('error', (error) => {
            reject(new Error(`Unable to start the .NET CLI: ${error.message}`, { cause: error }));
        });
        child.once('close', (code, signal) => {
            if (code === 0) {
                resolve({ code, signal, stdout, stderr });
                return;
            }

            const detail = stderr.trim() || stdout.trim() || `process exited with code ${code}`;
            reject(new Error(`dotnet ${args.join(' ')} failed: ${detail}`));
        });
    });
}

function startProcess(args, options = {}) {
    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
    const executable = options.executable || 'dotnet';

    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            shell: false,
            windowsHide: true
        });
        let started = false;

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (data) => options.onOutput?.({ stream: 'stdout', data }));
        child.stderr.on('data', (data) => options.onOutput?.({ stream: 'stderr', data }));
        child.once('spawn', () => {
            started = true;
            options.onSpawn?.(child);
            resolve(child);
        });
        child.once('error', (error) => {
            const wrapped = new Error(`Unable to start the .NET CLI: ${error.message}`, { cause: error });
            if (!started) {
                reject(wrapped);
            } else {
                options.onError?.(wrapped);
            }
        });
        child.once('close', (code, signal) => {
            options.onExit?.({ code, signal });
        });
    });
}

async function runProjectCommand(command, projectDirectory, options = {}) {
    const directory = path.resolve(requireNonEmptyString(projectDirectory, 'Project directory'));
    const projectFile = await findProjectFile(directory);
    const args = command === 'watch'
        ? ['watch', 'run', '--project', projectFile]
        : [command, projectFile];

    if (options.configuration) {
        const configuration = requireNonEmptyString(options.configuration, 'Configuration');
        args.push('--configuration', configuration);
    }

    return executeDotnet(args, { ...options, cwd: directory });
}

async function startProjectCommand(command, projectDirectory, options = {}) {
    if (command !== 'run' && command !== 'watch') {
        throw new TypeError(`Unsupported long-running .NET command: ${command}`);
    }
    const directory = path.resolve(requireNonEmptyString(projectDirectory, 'Project directory'));
    const projectFile = await findProjectFile(directory);
    const args = command === 'watch'
        ? ['watch', 'run', '--project', projectFile]
        : ['run', projectFile];
    if (options.configuration) {
        args.push('--configuration', requireNonEmptyString(options.configuration, 'Configuration'));
    }
    return startProcess(args, { ...options, cwd: directory });
}

function stopProcess(child) {
    if (!child || child.exitCode !== null || child.killed) {
        return Promise.resolve(false);
    }

    if (process.platform !== 'win32') {
        return Promise.resolve(child.kill('SIGTERM'));
    }

    return new Promise((resolve, reject) => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            shell: false,
            windowsHide: true
        });
        let stderr = '';
        killer.stderr.setEncoding('utf8');
        killer.stderr.on('data', (chunk) => { stderr += chunk; });
        killer.once('error', reject);
        killer.once('close', (code) => {
            if (code === 0) {
                resolve(true);
            } else if (child.exitCode !== null) {
                resolve(false);
            } else {
                reject(new Error(stderr.trim() || `Unable to stop process ${child.pid}.`));
            }
        });
    });
}

module.exports = {
    executeDotnet,
    startProcess,
    startProjectCommand,
    stopProcess,
    build: (projectDirectory, options) => runProjectCommand('build', projectDirectory, options),
    run: (projectDirectory, options) => runProjectCommand('run', projectDirectory, options),
    watch: (projectDirectory, options) => runProjectCommand('watch', projectDirectory, options)
};
