
import Joi from 'joi';
import { PdfFileSchema } from '../wrappers/PdfFile';

export class RecordConstraint {

    record: Record<string, FieldConstraint>;

    constructor(record:  Record<string, FieldConstraint>) {
        this.record = record;
    }

    toJoiSchema() {
        const newSchemaObj: any = {};
        Object.keys(this.record).forEach(key => {
            newSchemaObj[key] = this.record[key].toJoiSchema();
        });
        return Joi.object(newSchemaObj);
    }
    
};

export class FieldConstraint {

    displayNameKey: string;
    type: "file.pdf" | "files.pdf" | "string" | "number" | number[] | string[] | RecordConstraint;
    required: boolean;
    hintKey?: string;
    customSchema?: Joi.Schema;
    
    constructor(displayNameKey: string,
                type: "file.pdf" | "files.pdf" | "string" | "number" | number[] | string[] | RecordConstraint,
                required: boolean,
                hintKey?: string,
                customSchema?: Joi.Schema) {
        this.displayNameKey = displayNameKey;
        this.type = type;
        this.required = required;
        this.hintKey = hintKey;
        this.customSchema = customSchema;
    }

    toJoiSchema(): Joi.Schema {
        if (this.customSchema) return this.customSchema;

        var schema: Joi.Schema;
        if (Array.isArray(this.type)) {
            if (this.type.every(e => typeof e == 'string')) {
                schema = Joi.string().valid(...this.type);
            } else if (this.type.every(e => typeof e == 'number')) {
                schema = Joi.number().valid(...this.type);
            } else {
                schema = Joi.any().valid(this.type);
            }
        } else if (typeof this.type == 'string') {
            switch (this.type) {
                case "file.pdf":
                    schema = PdfFileSchema;
                    break;
                case "files.pdf":
                    schema = Joi.array().items(PdfFileSchema);
                    break;
                case "string":
                    schema = Joi.string();
                    break;
                case "number":
                    schema = Joi.number();
                    break;
                default:
                    throw new Error(`UiConf type '${this.type}' not supported`)
            }
        } else if (this.type instanceof FieldConstraint) {
            schema = this.type.toJoiSchema()
        } else {
            throw new Error(`UiConf type '${this.type}' not supported`)
        }

        if (this.required) {
            schema = schema.required();
        }

        return schema;
    }

}
