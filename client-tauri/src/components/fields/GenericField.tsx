import Joi from "@stirling-tools/joi";
import { Fragment } from "react";

interface GenericFieldProps {
    fieldName: string,
    joiDefinition: Joi.Description
}

interface Flags {
    label: string,
    description: string,
}
  
export function GenericField({ fieldName, joiDefinition }: GenericFieldProps) {
    const flags = joiDefinition.flags as Flags;

    switch (joiDefinition.type) {
        case "number":
            var validValues = joiDefinition.allow;
            if(validValues) { // Restrained number input
                return (
                    <Fragment>
                        <label htmlFor={fieldName}>{flags.label}:</label>
                        <input type="number" list={fieldName} name={fieldName}/>
                        <datalist id={fieldName}>
                            {joiDefinition.allow.map((e: string) => {
                                return (<option key={e} value={e}/>)
                            })}
                        </datalist>
                        <br/>
                    </Fragment>
                );
            }
            else { // Unrestrained number input
                // TODO: Check if integer or not.
                return (
                    <Fragment>
                        <label htmlFor={fieldName}>{flags.label}:</label>
                        <input type="number" list={fieldName} name={fieldName}/>
                        <br/>
                    </Fragment>
                );
            }
            break;
        case "string":
            if(joiDefinition.allow) { // Restrained text input
                return (
                    <Fragment>
                        <label htmlFor={fieldName}>{flags.label}:</label>
                        <input type="text" list={fieldName} name={fieldName}/>
                        <datalist id={fieldName}>
                            {joiDefinition.allow.map((e: string) => {
                                return (<option key={e} value={e}/>)
                            })}
                        </datalist>
                        <br/>
                    </Fragment>
                );
            }
            else {
                // TODO: Implement unrestrained text input
                return (<div>string, unrestrained text input is not implemented</div>)
            }
            break;
        case "comma_array":
            if(joiDefinition.items.length == 1) {
                const item: Joi.Description = joiDefinition.items[0];

                if(item.type == "number") {
                    const props: any = {};

                    item.rules.forEach((rule: { args: any, name: string}) => {

                        switch (rule.name) {
                            case "integer":
                                if(props.pattern) {
                                    return (<div>props.pattern was already set, this is not implemented.</div>);
                                }
                                props.pattern = `(\\d+)(,\\s*\\d+)*`;
                                break;
                            case "min":
                                // TODO: Could validate this in frontend first.
                                break;
                            case "max":
                                // TODO: Could validate this in frontend first.
                                break;
                            default:
                                return (<div>comma_array, item rule {rule.name} is not implemented.</div>);
                        }
                    });

                    return (
                        <Fragment>
                            <label htmlFor={fieldName}>{flags.label}:</label>
                            <input type="text" pattern={props.pattern} list={fieldName} name={fieldName}/>
                            <br/>
                        </Fragment>
                    );
                }
                else {
                    return (<div>comma_array, other types than numbers are not implemented yet.</div>);
                }
            }
            else {
                // TODO: Implement multiple items if necessary
                return (<div>comma_array, joi items are empty or bigger than one, this is not implemented</div>);
            }
            break;
        case "alternatives":
            return (
                <Fragment>
                    <label htmlFor={fieldName}>{flags.label}:</label>
                    <input type="text" list={fieldName} name={fieldName}/>
                    <br/>
                </Fragment>
            );
        default:
            console.log(joiDefinition);
            return (<div>GenericField.tsx: <br/> "{fieldName}": requested type "{joiDefinition.type}" not found. Check console for further info.</div>)
    }
}