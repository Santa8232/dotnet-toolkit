'use strict';

const { validateIdentifier } = require('../utils/validation');

function generateApi(name) {
    const modelName = validateIdentifier(name, 'Resource name');
    const controllerName = `${modelName}Controller`;

    return {
        path: `Controllers/Api/${controllerName}.cs`,
        content: `using Microsoft.AspNetCore.Mvc;

namespace Controllers.Api;

[ApiController]
[Route("api/[controller]")]
public class ${controllerName} : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok();
    }
}
`
    };
}

module.exports = { generateApi };
