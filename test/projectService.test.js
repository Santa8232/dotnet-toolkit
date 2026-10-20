'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { discoverApiEndpoints, discoverProjects, findProjectFile } = require('../src/services/projectService');

test('discovers project files and target frameworks while skipping build output', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-projects-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, 'App'), { recursive: true });
    await fs.mkdir(path.join(root, 'App', 'obj'), { recursive: true });
    await fs.writeFile(path.join(root, 'App', 'App.csproj'), '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
    await fs.writeFile(path.join(root, 'App', 'obj', 'Generated.csproj'), '<Project />');

    const projects = await discoverProjects(root);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'App');
    assert.equal(projects[0].targetFramework, 'net8.0');
    assert.deepEqual(projects[0].apiEndpoints, []);
    assert.equal(await findProjectFile(path.join(root, 'App')), path.join(root, 'App', 'App.csproj'));
});

test('discovers API controller and minimal API routes without including MVC routes', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-api-endpoints-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, 'Controllers'), { recursive: true });
    const controllerPath = path.join(root, 'Controllers', 'ProductsController.cs');
    await fs.writeFile(controllerPath, `using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok();

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id) => Ok();

    [HttpPost]
    public IActionResult Create() => Ok();
}

public class PagesController : Controller
{
    [HttpGet]
    public IActionResult Index() => Ok();
}
`);
    const minimalPath = path.join(root, 'Program.cs');
    await fs.writeFile(minimalPath, 'app.MapGet("/health", () => "ok");');

    const endpoints = await discoverApiEndpoints(root);
    assert.deepEqual(endpoints.map(({ method, route }) => `${method} ${route}`), [
        'GET /api/Products',
        'GET /api/Products/{id:int}',
        'POST /api/Products',
        'GET /health'
    ]);
    assert.equal(endpoints[0].path, controllerPath);
    assert.equal(endpoints[3].path, minimalPath);
});

test('reports when a directory does not contain exactly one project', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dotnet-empty-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await assert.rejects(findProjectFile(root), /No \.csproj file/);
});
