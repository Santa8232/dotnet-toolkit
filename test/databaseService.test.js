'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    addModelToContext,
    addModelAndUpdate,
    applyMigrations,
    configureProject,
    createPostgresConnectionString,
    getConnectionSecretKey,
    sanitizeErrorMessage,
    updateModelAndUpdate
} = require('../src/services/databaseService');

test('creates a safely quoted PostgreSQL connection string', () => {
    const connectionString = createPostgresConnectionString({
        host: 'localhost',
        port: '5432',
        database: 'shop;prod',
        username: 'app"user',
        password: 'p;ass"word'
    });

    assert.equal(
        connectionString,
        'Host="localhost";Port=5432;Database="shop;prod";Username="app""user";Password="p;ass""word";Include Error Detail=false'
    );
    assert.notEqual(getConnectionSecretKey('C:\\workspace\\app', 'AppContext'), connectionString);
    assert.throws(() => createPostgresConnectionString({
        host: 'localhost',
        port: '70000',
        database: 'db',
        username: 'user',
        password: 'secret'
    }), /Port must be/);
});

test('configures an ASP.NET Core context to use the runtime-provided PostgreSQL secret', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-config-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');
    const program = path.join(root, 'Program.cs');
    await fs.writeFile(program, `using App.Data;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<AppContext>(options => options.UseSqlServer("placeholder"));
var app = builder.Build();
`);

    await configureProject(root, { name: 'AppContext', namespace: 'App.Data' });
    const updated = await fs.readFile(program, 'utf8');
    assert.match(updated, /using Microsoft\.EntityFrameworkCore;/);
    assert.match(updated, /UseNpgsql\(Environment\.GetEnvironmentVariable\("DOTNET_TOOLKIT_CONNECTION_STRING"\)/);
    assert.doesNotMatch(updated, /UseSqlServer/);
});

test('adds a generated entity to the selected DbContext only once', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-context-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const contextPath = path.join(root, 'AppContext.cs');
    await fs.writeFile(contextPath, `namespace App.Data;
public class AppContext : DbContext
{
}
`);
    const context = { name: 'AppContext', path: contextPath };
    const model = { name: 'Product', namespace: 'App.Models', path: path.join(root, 'Product.cs') };

    assert.equal(await addModelToContext(context, model), true);
    assert.equal(await addModelToContext(context, model), false);

    const updated = await fs.readFile(contextPath, 'utf8');
    assert.match(updated, /using Microsoft\.EntityFrameworkCore;/);
    assert.match(updated, /using App\.Models;/);
    assert.equal((updated.match(/DbSet<Product>/g) || []).length, 1);
});

test('creates an initial migration when connecting a project with no migrations', async () => {
    const commands = [];
    const runDotnet = async (args, options) => {
        commands.push({ args, options });
        return {
            stdout: args.includes('list') ? 'No migrations were found.' : '',
            stderr: ''
        };
    };

    const createdInitialMigration = await applyMigrations({
        projectFile: 'App.csproj',
        projectDirectory: 'C:\\workspace\\app',
        contextName: 'AppContext',
        environment: { DOTNET_TOOLKIT_CONNECTION_STRING: 'secret' }
    }, runDotnet);

    assert.equal(createdInitialMigration, true);
    assert.deepEqual(commands.map(({ args }) => args.slice(0, 4)), [
        ['ef', 'migrations', 'list', '--context'],
        ['ef', 'migrations', 'add', 'Toolkit_Initial'],
        ['ef', 'database', 'update', '--context']
    ]);
    assert.equal(commands[2].options.env.DOTNET_TOOLKIT_CONNECTION_STRING, 'secret');
});

test('creates and applies a migration after adding a model to a DbContext', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-migration-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');
    const contextPath = path.join(root, 'AppContext.cs');
    await fs.writeFile(contextPath, `namespace App.Data;
public class AppContext : DbContext
{
}
`);
    const commands = [];
    const migrationName = await addModelAndUpdate({
        projectDirectory: root,
        context: { name: 'AppContext', path: contextPath },
        model: { name: 'Product', namespace: 'Models', path: path.join(root, 'Models', 'Product.cs') },
        connectionString: 'Host=localhost;Password=secret'
    }, async (args, options) => {
        commands.push({ args, options });
        return { stdout: '', stderr: '' };
    });

    assert.match(migrationName, /^Toolkit_Add_Product_/);
    assert.equal(commands.length, 2);
    assert.deepEqual(commands.map(({ args }) => args.slice(0, 4)), [
        ['ef', 'migrations', 'add', migrationName],
        ['ef', 'database', 'update', '--context']
    ]);
    assert.equal(commands[0].options.env.DOTNET_TOOLKIT_CONNECTION_STRING, 'Host=localhost;Password=secret');
    assert.match(await fs.readFile(contextPath, 'utf8'), /DbSet<Product>/);
});

test('adds a property to an existing model and applies its database migration', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-model-update-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');
    const modelPath = path.join(root, 'Models', 'Product.cs');
    const contextPath = path.join(root, 'Data', 'AppContext.cs');
    await fs.mkdir(path.dirname(modelPath));
    await fs.mkdir(path.dirname(contextPath));
    await fs.writeFile(modelPath, `namespace App.Models;
public class Product
{
    public int Id { get; set; }
}
`);
    await fs.writeFile(contextPath, `namespace App.Data;
public class AppContext : DbContext
{
    public DbSet<Product> Products { get; set; } = null!;
}
`);
    const commands = [];
    const migrationName = await updateModelAndUpdate({
        projectDirectory: root,
        context: { name: 'AppContext', path: contextPath },
        model: { name: 'Product', namespace: 'App.Models', path: modelPath },
        propertyName: 'Price',
        propertyType: 'decimal',
        connectionString: 'Host=localhost;******'
    }, async (args, options) => {
        commands.push({ args, options });
        return { stdout: '', stderr: '' };
    });

    assert.match(migrationName, /^Toolkit_Update_Product_/);
    assert.match(await fs.readFile(modelPath, 'utf8'), /public decimal Price \{ get; set; \}/);
    assert.equal(commands.length, 2);
    assert.deepEqual(commands.map(({ args }) => args.slice(1, 3)), [
        ['migrations', 'add'],
        ['database', 'update']
    ]);
    assert.equal(commands[0].options.env.DOTNET_TOOLKIT_CONNECTION_STRING, 'Host=localhost;******');
});

test('restores model and context when an update migration cannot be created', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-model-update-failure-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');
    const modelPath = path.join(root, 'Product.cs');
    const contextPath = path.join(root, 'AppContext.cs');
    const originalModel = `public class Product
{
    public int Id { get; set; }
}
`;
    const originalContext = `public class AppContext : DbContext
{
}
`;
    await fs.writeFile(modelPath, originalModel);
    await fs.writeFile(contextPath, originalContext);

    await assert.rejects(updateModelAndUpdate({
        projectDirectory: root,
        context: { name: 'AppContext', path: contextPath },
        model: { name: 'Product', path: modelPath },
        propertyName: 'Price',
        propertyType: 'decimal',
        connectionString: 'Host=localhost;******'
    }, async () => { throw new Error('Migration failed'); }), /Migration failed/);

    assert.equal(await fs.readFile(modelPath, 'utf8'), originalModel);
    assert.equal(await fs.readFile(contextPath, 'utf8'), originalContext);
});

test('keeps the updated model when its created migration fails to apply', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-model-apply-failure-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');
    const modelPath = path.join(root, 'Product.cs');
    const contextPath = path.join(root, 'AppContext.cs');
    await fs.writeFile(modelPath, `public class Product
{
    public int Id { get; set; }
}
`);
    await fs.writeFile(contextPath, `public class AppContext : DbContext
{
    public DbSet<Product> Products { get; set; } = null!;
}
`);
    let commandCount = 0;

    await assert.rejects(updateModelAndUpdate({
        projectDirectory: root,
        context: { name: 'AppContext', path: contextPath },
        model: { name: 'Product', path: modelPath },
        propertyName: 'Price',
        propertyType: 'decimal',
        connectionString: 'Host=localhost;******'
    }, async () => {
        commandCount += 1;
        if (commandCount === 2) {
            throw new Error('Database update failed');
        }
        return { stdout: '', stderr: '' };
    }), (error) => error.migrationCreated && /^Toolkit_Update_Product_/.test(error.migrationName));

    assert.match(await fs.readFile(modelPath, 'utf8'), /public decimal Price \{ get; set; \}/);
});

test('initializes generated string properties and includes compiler diagnostics on migration build failure', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-model-build-diagnostics-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const projectFile = path.join(root, 'App.csproj');
    const modelPath = path.join(root, 'Product.cs');
    const contextPath = path.join(root, 'AppContext.cs');
    await fs.writeFile(projectFile, '<Project />');
    const originalModel = `public class Product
{
    public int Id { get; set; }
}
`;
    await fs.writeFile(modelPath, originalModel);
    await fs.writeFile(contextPath, `public class AppContext : DbContext
{
    public DbSet<Product> Products { get; set; } = null!;
}
`);
    const commands = [];

    await assert.rejects(updateModelAndUpdate({
        projectDirectory: root,
        context: { name: 'AppContext', path: contextPath },
        model: { name: 'Product', path: modelPath },
        propertyName: 'Description',
        propertyType: 'string',
        connectionString: 'Host=localhost;******'
    }, async (args) => {
        commands.push(args);
        if (args[0] === 'ef') {
            assert.match(await fs.readFile(modelPath, 'utf8'), /public string Description \{ get; set; \} = string\.Empty;/);
            throw new Error('dotnet ef migrations add failed: Build started... Build failed. Use dotnet build to see the errors.');
        }
        throw new Error('App.cs(12,4): error CS1002: ; expected');
    }), /Build diagnostics:[\s\S]*error CS1002/);

    assert.deepEqual(commands.map((args) => args[0]), ['ef', 'build']);
    assert.equal(await fs.readFile(modelPath, 'utf8'), originalModel);
});

test('redacts a database password from process errors', () => {
    const error = new Error('Login failed for p;ass"word');
    assert.equal(sanitizeErrorMessage(error, ['p;ass"word']), 'Login failed for [redacted]');
    assert.equal(
        sanitizeErrorMessage(new Error('Postgres rejected Password="sensitive;value" for the session.')),
        'Postgres rejected Password=[redacted] for the session.'
    );
});
