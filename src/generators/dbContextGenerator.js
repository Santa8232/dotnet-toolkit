'use strict';

const { validateIdentifier } = require('../utils/validation');

function generateDbContext(name, models = []) {
    const contextName = validateIdentifier(name, 'DbContext name');
    const modelProperties = models.map((model) => {
        const modelName = validateIdentifier(model, 'Model name');
        return `    public DbSet<${modelName}> ${modelName}s { get; set; }`;
    });
    const modelUsing = modelProperties.length ? 'using Models;\n' : '';

    return `using Microsoft.EntityFrameworkCore;
${modelUsing}

namespace Data;

public class ${contextName} : DbContext
{
    public ${contextName}(DbContextOptions<${contextName}> options) : base(options)
    {
    }
${modelProperties.length ? `\n${modelProperties.join('\n')}\n` : ''}
}
`;
}

module.exports = { generateDbContext };
