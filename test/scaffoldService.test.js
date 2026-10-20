'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { scaffold } = require('../src/services/scaffoldService');

test('creates generated files under a .NET project and refuses to overwrite them', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-scaffold-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');

    const files = await scaffold({
        type: 'model',
        name: 'Product',
        projectDirectory: root,
        workspaceRoot: root
    });
    assert.deepEqual(files, [path.join(root, 'Models', 'Product.cs')]);
    const generatedModel = await fs.readFile(files[0], 'utf8');
    assert.match(generatedModel, /public class Product/);
    assert.match(generatedModel, /public int Id \{ get; set; \}/);
    await assert.rejects(scaffold({
        type: 'model',
        name: 'Product',
        projectDirectory: root,
        workspaceRoot: root
    }), /Refusing to overwrite/);
});

test('rejects project directories outside the selected workspace', async () => {
    await assert.rejects(scaffold({
        type: 'model',
        name: 'Product',
        projectDirectory: path.resolve(os.tmpdir(), 'other-project'),
        workspaceRoot: path.resolve(os.tmpdir(), 'workspace')
    }), /inside the workspace/);
});

test('creates an EF Core MVC CRUD controller and its Razor views', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-mvc-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'Shop.csproj'), '<Project><PropertyGroup><RootNamespace>Shop</RootNamespace></PropertyGroup></Project>');
    await fs.mkdir(path.join(root, 'Models'));
    await fs.mkdir(path.join(root, 'Data'));
    await fs.writeFile(path.join(root, 'Models', 'Product.cs'), `namespace Shop.Models;
public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}
`);
    await fs.writeFile(path.join(root, 'Data', 'ShopContext.cs'), `using Microsoft.EntityFrameworkCore;
namespace Shop.Data;
public class ShopContext : DbContext { }
`);

    const files = await scaffold({
        type: 'mvc',
        modelName: 'Product',
        contextName: 'ShopContext',
        projectDirectory: root,
        workspaceRoot: root
    });

    assert.equal(files.length, 7);
    assert.ok(files.includes(path.join(root, 'Controllers', 'ProductController.cs')));
    for (const viewName of ['Index', 'Details', 'Create', 'Edit', 'Delete', '_ViewImports']) {
        assert.ok(files.includes(path.join(root, 'Views', 'Product', `${viewName}.cshtml`)));
    }
    const controller = await fs.readFile(path.join(root, 'Controllers', 'ProductController.cs'), 'utf8');
    assert.match(controller, /ToListAsync/);
    assert.match(controller, /SaveChangesAsync/);
    assert.match(controller, /ValidateAntiForgeryToken/);
    assert.match(controller, /namespace Shop\.Controllers/);
    const context = await fs.readFile(path.join(root, 'Data', 'ShopContext.cs'), 'utf8');
    assert.match(context, /using Shop\.Models;/);
    assert.match(context, /DbSet<Product>/);
    const createView = await fs.readFile(path.join(root, 'Views', 'Product', 'Create.cshtml'), 'utf8');
    assert.match(createView, /AntiForgeryToken/);
    assert.match(createView, /asp-for="Name"/);
});

test('requires an existing model and EF Core context for MVC CRUD generation', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-mvc-prereq-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'App.csproj'), '<Project />');
    await assert.rejects(scaffold({
        type: 'mvc',
        modelName: 'Product',
        contextName: 'AppContext',
        projectDirectory: root,
        workspaceRoot: root
    }), /Choose an existing model/);
});

test('creates a starter DbContext that can be discovered before any models exist', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-db-context-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'Demo.csproj'), '<Project />');

    const files = await scaffold({
        type: 'dbContext',
        name: 'DemoDbContext',
        projectDirectory: root,
        workspaceRoot: root
    });

    assert.deepEqual(files, [path.join(root, 'Data', 'DemoDbContext.cs')]);
    const content = await fs.readFile(files[0], 'utf8');
    assert.match(content, /class DemoDbContext : DbContext/);
    assert.doesNotMatch(content, /using Models;/);

    const { discoverMvcArtifacts } = require('../src/services/projectService');
    const artifacts = await discoverMvcArtifacts(root);
    assert.deepEqual(artifacts.dbContexts.map((context) => context.name), ['DemoDbContext']);
});
