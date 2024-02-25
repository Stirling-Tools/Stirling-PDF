import Joi from "@stirling-tools/joi";
import { GenericField } from "./GenericField";
import React from "react";

interface BuildFieldsProps {
    /** The text to display inside the button */
    schemaDescription: Joi.Description | undefined;
    onSubmit: React.FormEventHandler<HTMLFormElement>;
}

export function BuildFields({ schemaDescription, onSubmit }: BuildFieldsProps) {
    console.log("Render Build Fields", schemaDescription);
    const label = (schemaDescription?.flags as any)?.label
    const description = (schemaDescription?.flags as any)?.description;
    const values = (schemaDescription?.keys as any)?.values.keys as { [key: string]: Joi.Description};
    return (
        <div>
            <h3>{label}</h3>
            {description}
            <hr />
            <form onSubmit={(e) => { onSubmit(e); e.preventDefault(); }}>
            {
                values ? Object.keys(values).map((key, i) => {  
                    return (<GenericField key={key} fieldName={key} joiDefinition={values[key]} />) 
                }) : undefined
            }
                <input type="submit" value="Submit" />
            </form>
        </div>
    );
}