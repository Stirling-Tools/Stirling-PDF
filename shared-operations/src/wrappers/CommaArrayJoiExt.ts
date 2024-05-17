import Joi from "@stirling-tools/joi";

export default Joi.extend((joi) => {
    return {
        // e.g. "'1', '2', '3', '10', '100', 'hello'"
        type: 'comma_array',
        base: joi.array(), 
        messages: {
            'comma_array.base': '{{#label}} must be a comma seperated list',
        },
        coerce: {
            from: 'string',
            method(value, helpers) {
    
                if (typeof value !== 'string' || !/(\d+)(,\s*\d+)*/.test(value)) { // is string and in format "[number], [number]"
                    return;
                }
    
                try {
                    return { value: value.split(",").map(v => v.trim()) };
                }
                catch (ignoreErr) { }
            }
        }

    }
});