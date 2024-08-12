import Joi from "@stirling-tools/joi";
import { GenericField } from "./fields/GenericField";
import React from "react";

import styles from "./BuildForm.module.css";

interface BuildFormProps {
    /** The text to display inside the button */
    schemaDescription: Joi.Description | undefined;
    onSubmit: React.FormEventHandler<HTMLFormElement>;
}

export function BuildForm({ schemaDescription, onSubmit }: BuildFormProps) {
    console.log("Render Build Fields", schemaDescription);
    const values = (schemaDescription?.keys as any)?.values.keys as { [key: string]: Joi.Description};
    return (
        <form onSubmit={(e) => { onSubmit(e); e.preventDefault(); }}>
            <div className={styles.fields}>
            {
                values ? Object.keys(values).map((key) => {  
                    return (<GenericField key={key} fieldName={key} joiDefinition={values[key]} />) 
                }) : undefined
            }
            </div>
            <input className={styles.submit} type="submit" value="Submit" />
        </form>
    );
}