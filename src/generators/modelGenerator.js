'use strict';

const { validateIdentifier } = require('../utils/validation');

function generateModel(name, properties = []) {
    const modelName = validateIdentifier(name, 'Model name');
    const modelProperties = properties.length
        ? properties
        : [{ name: 'Id', type: 'int' }];
    const members = modelProperties.map((property) => {
        const propertyName = validateIdentifier(property.name, 'Property name');
        const type = validatePropertyType(property.type || 'string');
        return `        public ${type} ${propertyName} { get; set; }`;
    });
    const body = members.length ? `${members.join('\n')}\n` : '';

    return `namespace Models;

public class ${modelName}
{
${body}}
`;
}

function validatePropertyType(type) {
    if (typeof type !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.]*(\[\])?(\?)?$/.test(type)) {
        throw new TypeError('Property type must be a valid C# type name.');
    }
    return type;
}

module.exports = { generateModel };
