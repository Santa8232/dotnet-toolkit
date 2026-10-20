'use strict';

const { validateIdentifier } = require('../utils/validation');

function generateMvc(options) {
    const model = validateIdentifier(options.modelName, 'Model name');
    const context = validateIdentifier(options.contextName, 'DbContext name');
    const controller = `${model}Controller`;
    const modelNamespace = options.modelNamespace;
    const contextNamespace = options.contextNamespace;
    const modelProperties = options.modelProperties || [];
    const keyProperty = modelProperties.find((property) =>
        property.name === 'Id' || property.name === `${model}Id` || property.isKey
    );

    if (!keyProperty) {
        throw new TypeError(`Model ${model} must have an Id or ${model}Id property to generate MVC CRUD actions.`);
    }

    const key = validateIdentifier(keyProperty.name, 'Key property');
    const keyType = keyProperty.type || 'int';
    if (!/^[A-Za-z_][A-Za-z0-9_.]*(\?)?$/.test(keyType)) {
        throw new TypeError(`The key type ${keyType} is not supported by the MVC CRUD generator.`);
    }
    const createProperties = modelProperties
        .filter((property) => property.name !== key)
        .map((property) => property.name);
    const bindAttribute = (properties) => `[Bind("${properties.join(',')}")] `;
    const controllerNamespace = options.controllerNamespace || 'Controllers';
    const namespaceUsings = [...new Set([modelNamespace, contextNamespace])]
        .filter(Boolean)
        .map((value) => `using ${value};`)
        .join('\n');
    const controllerContent = `using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
${namespaceUsings}

namespace ${controllerNamespace};

public class ${controller} : Controller
{
    private readonly ${context} _context;

    public ${controller}(${context} context)
    {
        _context = context;
    }

    public async Task<IActionResult> Index()
    {
        return View(await _context.Set<${model}>().ToListAsync());
    }

    public async Task<IActionResult> Details(${keyType}? id)
    {
        if (id == null)
        {
            return NotFound();
        }

        var item = await _context.Set<${model}>().FirstOrDefaultAsync(value => value.${key} == id);
        return item == null ? NotFound() : View(item);
    }

    public IActionResult Create()
    {
        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(${bindAttribute(createProperties)}${model} item)
    {
        if (!ModelState.IsValid)
        {
            return View(item);
        }

        _context.Add(item);
        await _context.SaveChangesAsync();
        return RedirectToAction(nameof(Index));
    }

    public async Task<IActionResult> Edit(${keyType}? id)
    {
        if (id == null)
        {
            return NotFound();
        }

        var item = await _context.Set<${model}>().FindAsync(id);
        return item == null ? NotFound() : View(item);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(${keyType} id, ${bindAttribute([key, ...createProperties])}${model} item)
    {
        if (id != item.${key})
        {
            return NotFound();
        }

        if (!ModelState.IsValid)
        {
            return View(item);
        }

        try
        {
            _context.Update(item);
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!await _context.Set<${model}>().AnyAsync(value => value.${key} == id))
            {
                return NotFound();
            }

            throw;
        }

        return RedirectToAction(nameof(Index));
    }

    public async Task<IActionResult> Delete(${keyType}? id)
    {
        if (id == null)
        {
            return NotFound();
        }

        var item = await _context.Set<${model}>().FirstOrDefaultAsync(value => value.${key} == id);
        return item == null ? NotFound() : View(item);
    }

    [HttpPost, ActionName("Delete")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteConfirmed(${keyType} id)
    {
        var item = await _context.Set<${model}>().FindAsync(id);
        if (item != null)
        {
            _context.Set<${model}>().Remove(item);
            await _context.SaveChangesAsync();
        }

        return RedirectToAction(nameof(Index));
    }
}
`;

    return [
        { path: `Controllers/${controller}.cs`, content: controllerContent },
        {
            path: `Views/${model}/Index.cshtml`,
            content: generateIndexView(model, modelNamespace, modelProperties, key)
        },
        {
            path: `Views/${model}/Details.cshtml`,
            content: generateDetailsView(model, modelNamespace, modelProperties, key)
        },
        {
            path: `Views/${model}/Create.cshtml`,
            content: generateFormView(model, modelNamespace, modelProperties, 'Create', key)
        },
        {
            path: `Views/${model}/Edit.cshtml`,
            content: generateFormView(model, modelNamespace, modelProperties, 'Edit', key)
        },
        {
            path: `Views/${model}/Delete.cshtml`,
            content: generateDeleteView(model, modelNamespace, modelProperties, key)
        },
        {
            path: `Views/${model}/_ViewImports.cshtml`,
            content: `@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers
`
        }
    ];
}

function modelDirective(model, modelNamespace, collection = false) {
    const typeName = modelNamespace ? `${modelNamespace}.${model}` : model;
    return `@model ${collection ? `IEnumerable<${typeName}>` : typeName}`;
}

function propertiesForView(properties, key) {
    return properties.filter((property) => property.name === key || property.isScalar !== false);
}

function generateIndexView(model, modelNamespace, properties, key) {
    const columns = propertiesForView(properties, key);
    const headers = columns.map((property) => `            <th scope="col">@Html.DisplayNameFor(model => model.${property.name})</th>`).join('\n');
    const values = columns.map((property) => `                <td>@Html.DisplayFor(modelItem => item.${property.name})</td>`).join('\n');

    return `${modelDirective(model, modelNamespace, true)}

@{
    ViewData["Title"] = "${model} list";
}

<h1>${model} list</h1>

<p><a asp-action="Create" class="btn btn-primary">Create new</a></p>
<table class="table">
    <thead>
        <tr>
${headers}
            <th scope="col">Actions</th>
        </tr>
    </thead>
    <tbody>
@foreach (var item in Model)
{
        <tr>
${values}
            <td>
                <a asp-action="Edit" asp-route-id="@item.${key}">Edit</a> |
                <a asp-action="Details" asp-route-id="@item.${key}">Details</a> |
                <a asp-action="Delete" asp-route-id="@item.${key}">Delete</a>
            </td>
        </tr>
}
    </tbody>
</table>
`;
}

function generateDetailsView(model, modelNamespace, properties, key) {
    const details = propertiesForView(properties, key)
        .map((property) => `    <dt class="col-sm-3">@Html.DisplayNameFor(model => model.${property.name})</dt>\n    <dd class="col-sm-9">@Html.DisplayFor(model => model.${property.name})</dd>`)
        .join('\n');

    return `${modelDirective(model, modelNamespace)}

@{
    ViewData["Title"] = "${model} details";
}

<h1>${model} details</h1>
<dl class="row">
${details}
</dl>
<a asp-action="Edit" asp-route-id="@Model.${key}" class="btn btn-primary">Edit</a>
<a asp-action="Index" class="btn btn-secondary">Back to list</a>
`;
}

function generateFormView(model, modelNamespace, properties, action, key) {
    const fields = propertiesForView(properties, key)
        .filter((property) => property.name !== key)
        .map((property) => `    <div class="mb-3">
        <label asp-for="${property.name}" class="form-label"></label>
        <input asp-for="${property.name}" class="form-control" />
        <span asp-validation-for="${property.name}" class="text-danger"></span>
    </div>`)
        .join('\n');
    const hiddenKey = action === 'Edit' ? `    <input type="hidden" asp-for="${key}" />\n` : '';

    return `${modelDirective(model, modelNamespace)}

@{
    ViewData["Title"] = "${action} ${model}";
}

<h1>${action} ${model}</h1>
<form asp-action="${action}" method="post">
    @Html.AntiForgeryToken()
${hiddenKey}${fields}
    <button type="submit" class="btn btn-primary">${action}</button>
    <a asp-action="Index" class="btn btn-secondary">Cancel</a>
</form>

`;
}

function generateDeleteView(model, modelNamespace, properties, key) {
    const details = propertiesForView(properties, key)
        .map((property) => `    <dt class="col-sm-3">@Html.DisplayNameFor(model => model.${property.name})</dt>\n    <dd class="col-sm-9">@Html.DisplayFor(model => model.${property.name})</dd>`)
        .join('\n');

    return `${modelDirective(model, modelNamespace)}

@{
    ViewData["Title"] = "Delete ${model}";
}

<h1>Delete ${model}</h1>
<p>Are you sure you want to delete this item?</p>
<dl class="row">
${details}
</dl>
<form asp-action="Delete" method="post">
    @Html.AntiForgeryToken()
    <input type="hidden" asp-for="${key}" />
    <button type="submit" class="btn btn-danger">Delete</button>
    <a asp-action="Index" class="btn btn-secondary">Cancel</a>
</form>
`;
}

module.exports = { generateMvc };
