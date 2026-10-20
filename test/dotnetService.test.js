'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { executeDotnet, startProcess } = require('../src/services/dotnetService');

test('passes runtime configuration through the child process environment', async () => {
    const result = await executeDotnet([
        '-e',
        'process.stdout.write(process.env.DOTNET_TOOLKIT_CONNECTION_STRING || "")'
    ], {
        executable: process.execPath,
        env: { DOTNET_TOOLKIT_CONNECTION_STRING: 'Host=localhost;Password=secret' }
    });

    assert.equal(result.stdout, 'Host=localhost;Password=secret');
});

test('reports long-running process startup and streams output before exit', async () => {
    let spawned = false;
    let processExit;
    let resolveOutput;
    const exit = new Promise((resolve) => { processExit = resolve; });
    const output = new Promise((resolve) => { resolveOutput = resolve; });

    const child = await startProcess([
        '-e',
        'process.stdout.write("server ready"); setTimeout(() => process.exit(0), 100)'
    ], {
        executable: process.execPath,
        onSpawn: () => { spawned = true; },
        onOutput: ({ stream, data }) => {
            if (stream === 'stdout') resolveOutput(data);
        },
        onExit: processExit
    });

    assert.equal(spawned, true);
    assert.equal(child.pid > 0, true);
    assert.equal(await output, 'server ready');
    assert.deepEqual(await exit, { code: 0, signal: null });
});
