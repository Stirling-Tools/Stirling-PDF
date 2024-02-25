import { Link } from "react-router-dom";

import { BaseSyntheticEvent, createContext, useRef, useState } from "react";
import { Operator } from "@stirling-pdf/shared-operations/src/functions";
import i18next from "i18next";
import Joi from "@stirling-tools/joi";
import { BuildFields } from "../components/fields/BuildFields";
import { listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";
import { PdfFile, RepresentationType } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile";
import { Action } from "@stirling-pdf/shared-operations/declarations/Action";
import { JoiPDFFileSchema } from "@stirling-pdf/shared-operations/src/wrappers/PdfFileJoi";

function Dynamic() {
    const [schemaDescription, setSchemaDescription] = useState<Joi.Description>();

    const operators = listOperatorNames();
    const activeOperator = useRef<typeof Operator>();

    function selectionChanged(s: BaseSyntheticEvent) {
        const selectedValue = s.target.value;
        if(selectedValue == "none") {
            setSchemaDescription(undefined);
            return;
        }

        i18next.loadNamespaces(selectedValue, (err, t) => {
            if (err) throw err;

            const LoadingModule = import(`@stirling-pdf/shared-operations/src/functions/${selectedValue}`) as Promise<{ [key: string]: typeof Operator }>;
            LoadingModule.then((Module) => {
                const Operator = Module[capitalizeFirstLetter(selectedValue)];
                const description = Operator.schema.describe();

                activeOperator.current = Operator;
                // This will update children
                setSchemaDescription(description);
            });
        });
    }

    function formDataToObject(formData: FormData): Record<string, string> {
        const result: Record<string, string> = {};
      
        formData.forEach((value, key) => {
          result[key] = value.toString();
        });
      
        return result;
    }

    async function handleSubmit(e: BaseSyntheticEvent) {
        if(!activeOperator.current) {
            throw new Error("Please select an Operator in the Dropdown");
        }

        const formData = new FormData(e.target);
        
        const action: Action = {type: activeOperator.current.constructor.name, values: formDataToObject(formData)};

        // Validate PDF File

        // Createing the pdffile before validation because joi cant handle it for some reason and I can't fix the underlying issue / I want to make progress, wasted like 3 hours on this already. TODO: The casting should be done in JoiPDFFileSchema.ts if done correctly...
        const files = (document.getElementById("pdfFile") as HTMLInputElement).files;
        const inputs: PdfFile[] = [];

        if(files) {
            const filesArray: File[] = Array.from(files as any);
            for (let i = 0; i < files.length; i++) {
                const file = filesArray[i];
                if(file) {
                    console.log(new Uint8Array(await file.arrayBuffer()));
                    inputs.push(new PdfFile(
                        file.name.replace(/\.[^/.]+$/, ""), // Strip Extension
                        new Uint8Array(await file.arrayBuffer()),
                        RepresentationType.Uint8Array
                    ));
                }
                else
                    throw new Error("This should not happen. Contact maintainers.");
            }
        }

        const pdfValidationResults = await JoiPDFFileSchema.validate(inputs);
        if(pdfValidationResults.error) {
            console.log({error: "PDF validation failed", details: pdfValidationResults.error.message});
        }
        const pdfFiles: PdfFile[] = pdfValidationResults.value;

        // Validate Action Values
        const actionValidationResults = activeOperator.current.schema.validate({input: pdfFiles, values: action.values});

        if(actionValidationResults.error) {
            console.log({error: "Value validation failed", details: actionValidationResults.error.message});
            return;
        }
        
        action.values = pdfValidationResults.value.values;
        const operation = new activeOperator.current(action);
        
        operation.run(pdfValidationResults.value, (progress) => {}).then(pdfFiles => {
            console.log("Done");
        });
    };

    function capitalizeFirstLetter(string: String) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    return (
        <div>
            <h2>Dynamic test page for operators</h2>

            <input type="file" id="pdfFile" accept=".pdf" multiple />
            <br />
            <select id="pdfOptions" onChange={selectionChanged}>
                <option value="none">none</option>
                { operators.map((operator, i) => {
                    return (<option key={operator} value={operator}>{operator}</option>)
                }) }
            </select>

            <div id="values">
                <BuildFields schemaDescription={schemaDescription} onSubmit={handleSubmit}></BuildFields>
            </div>

            <p>
                <Link to="/">Go back home...</Link>
            </p>
        </div>
    );
}


export default Dynamic;
