import Joi from "@stirling-tools/joi";
import { Fragment } from "react";

interface GenericFieldProps {
    fieldName: string
    joiDefinition: Joi.Description;
}
  
export function GenericField({ fieldName, joiDefinition }: GenericFieldProps) {
    switch (joiDefinition.type) {
        case "number":
            var validValues = joiDefinition.allow;
            if(validValues) { // Restrained text input
                return (
                    <Fragment>
                        <label htmlFor={fieldName}>{fieldName}:</label>
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
            else {
                // TODO: Implement unrestrained text input
                return (<pre>{JSON.stringify(joiDefinition, null, 2)}</pre>)
            }
            break;
        case "string":
            var validValues = joiDefinition.allow;
            if(validValues) { // Restrained text input
                return (
                    <Fragment>
                        <label htmlFor={fieldName}>{fieldName}:</label>
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
                return (<pre>{JSON.stringify(joiDefinition, null, 2)}</pre>)
            }
            break;
            
        default:
            return (<div>Field "{fieldName}": <br /> requested type "{joiDefinition.type}" not found</div>)
    }
}