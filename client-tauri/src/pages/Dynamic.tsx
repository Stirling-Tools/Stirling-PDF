import { Link } from "react-router-dom";
import { Fragment } from "react";

import { BaseSyntheticEvent, useRef, useState } from "react";
import { Operator, OperatorSchema } from "@stirling-pdf/shared-operations/src/functions";
import Joi from "@stirling-tools/joi";
import { BuildFields } from "../components/fields/BuildFields";
import { getOperatorByName, getSchemaByName, listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";
import { PdfFile, RepresentationType } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile";
import { Action } from "@stirling-pdf/shared-operations/declarations/Action";

function Dynamic() {
    const [schemaDescription, setSchemaDescription] = useState<Joi.Description>();

    const operators = listOperatorNames();

    const activeOperatorName = useRef<string>();
    const activeOperator = useRef<typeof Operator>();
    const activeSchema = useRef<OperatorSchema>();

    async function selectionChanged(s: BaseSyntheticEvent) {
        const selectedValue = s.target.value;
        console.log("Selection changed to", selectedValue);
        if(selectedValue == "none") {
            setSchemaDescription(undefined);
            return;
        }

        getSchemaByName(selectedValue).then(async schema => {
            if(schema) {
                const description = schema.schema.describe();
                activeOperatorName.current = selectedValue;
                activeOperator.current = await getOperatorByName(selectedValue);
                activeSchema.current = schema;

                // This will update children
                setSchemaDescription(description);
            }
        });
    }

    async function handleSubmit(e: BaseSyntheticEvent) {
        console.clear();
        if(!activeOperatorName.current || !activeOperator.current || !activeSchema.current) {
            throw new Error("Please select an Operator in the Dropdown");
        }

        const formData = new FormData(e.target);
        const values = Object.fromEntries(formData.entries());
        let action: Action = {type: activeOperatorName.current, values: values};

        // Validate PDF File

        // Createing the pdffile before validation because joi cant handle it for some reason and I can't fix the underlying issue / I want to make progress, wasted like 3 hours on this already. TODO: The casting should be done in JoiPDFFileSchema.ts if done correctly...
        const files = (document.getElementById("pdfFile") as HTMLInputElement).files;
        const inputs: PdfFile[] = [];

        if(files) {
            const filesArray: File[] = Array.from(files as any);
            for (let i = 0; i < files.length; i++) {
                const file = filesArray[i];
                if(file) {
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

        const validationResults = activeSchema.current.schema.validate({input: inputs, values: action.values});

        if(validationResults.error) {
            console.error({error: "Validation failed", details: validationResults.error.message}, validationResults.error.stack);
        }
        else {
            action.values = validationResults.value.values;
            const operation = new activeOperator.current(action);
            operation.run(validationResults.value.input, (progress) => {
                console.log("OperationProgress: " + progress.operationProgress, "CurFileProgress: " + progress.curFileProgress);
            }).then(async pdfFiles => {
                console.log("Result", pdfFiles);

                for await (const pdfFile of (pdfFiles as PdfFile[])) {
                    var blob = new Blob([await pdfFile.uint8Array], {type: "application/pdf"});
                    var objectUrl = URL.createObjectURL(blob);
                    window.open(objectUrl);
                }
            });
        }
    };

    return (
        <Fragment>
            <h2>Dynamic test page for operators</h2>

            <input type="file" id="pdfFile" accept=".pdf" multiple />
            <br />
            <select id="pdfOptions" onChange={selectionChanged}>
                <option value="none">none</option>
                { operators.map((operator) => {
                    return (<option key={operator} value={operator}>{operator}</option>)
                }) }
            </select>

            <div id="values">
                <BuildFields schemaDescription={schemaDescription} onSubmit={handleSubmit}></BuildFields>
            </div>

            <p>
                <Link to="/">Go back home...</Link>
            </p>
        </Fragment>
    );
}


export default Dynamic;
