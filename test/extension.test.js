'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { registerExtension } = require('../extension');
const { SidebarProvider } = require('../src/providers/sidebarProvider');

test('registers the sidebar provider and contributed commands', () => {
    const registrations = [];
    const context = {
        extensionUri: { fsPath: '/extension' },
        subscriptions: []
    };
    const vscode = {
        window: {
            registerWebviewViewProvider: (id, provider) => {
                registrations.push({ id, provider });
                return { dispose() {} };
            }
        },
        commands: {
            registerCommand: (id, callback) => {
                registrations.push({ id, callback });
                return { dispose() {} };
            }
        }
    };

    const provider = registerExtension(context, vscode);

    assert.equal(registrations[0].id, 'dotnetCrudPanel');
    assert.equal(registrations[0].provider, provider);
    assert.deepEqual(
        registrations.slice(1).map((registration) => registration.id),
        [
            'dotnetCrud.refreshProjects',
            'dotnetCrud.build',
            'dotnetCrud.run',
            'dotnetCrud.watch'
        ]
    );
    assert.equal(context.subscriptions.length, 6);
});

test('serves the sidebar with an allowed stylesheet and secure script nonce', () => {
    const extensionUri = { fsPath: process.cwd() };
    const vscode = {
        Uri: {
            joinPath: (base, ...segments) => ({
                fsPath: [base.fsPath, ...segments].join('\\')
            })
        }
    };
    const provider = new SidebarProvider(extensionUri, vscode);
    const html = provider.getHtml({
        cspSource: 'vscode-webview://test',
        asWebviewUri: (uri) => `vscode-webview://test/${uri.fsPath.split('\\').pop()}`
    });

    assert.match(html, /style-src vscode-webview:\/\/test/);
    assert.match(html, /href="vscode-webview:\/\/test\/sidebar\.css"/);
    assert.match(html, /script-src 'nonce-[a-f0-9]+'/);
    assert.doesNotMatch(html, /\{\{(?:styleUri|scriptUri|cspSource|nonce)\}\}/);
});

test('restores active process controls when the webview becomes ready again', async () => {
    const postedMessages = [];
    const provider = new SidebarProvider({ fsPath: '/extension' }, {});
    provider.panel = { webview: { postMessage: (message) => postedMessages.push(message) } };
    provider.activeProcesses.set('C:\\workspace\\App', {
        command: 'run',
        child: { pid: 1234 }
    });

    await provider.handleMessage({ command: 'ready' });

    assert.deepEqual(postedMessages, [{
        command: 'processState',
        processes: [{
            command: 'run',
            projectDirectory: path.resolve('C:\\workspace\\App'),
            starting: false
        }]
    }]);
});
