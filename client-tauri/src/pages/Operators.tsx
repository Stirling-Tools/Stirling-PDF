import { Fragment, useEffect, useRef } from "react";

import { BaseSyntheticEvent, useState } from "react";
import { BuildForm } from "../components/BuildForm";
import { getOperatorByName, getSchemaByName } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";
import { PdfFile, RepresentationType } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile";
import { Action } from "@stirling-pdf/shared-operations/declarations/Action";

import { useLocation } from 'react-router-dom'

import InputField from "../components/fields/InputField";


function Dynamic() {
    const [schema, setSchema] = useState<any>(undefined); // TODO: Type as joi type

    const location = useLocation();

    const operatorInternalName = location.pathname.split("/")[2]; // /operators/<operatorInternalName>

    useEffect(() => {
        getSchemaByName(operatorInternalName).then(schema => {
            if(schema) {
                setSchema(schema.schema);
            }
        });
    }, [location]);
    
    const inputRef = useRef<HTMLInputElement>();

    async function handleSubmit(e: BaseSyntheticEvent) {
        const formData = new FormData(e.target);
        const values = Object.fromEntries(formData.entries());
        let action: Action = {type: operatorInternalName, values: values};


        // Validate PDF File

        // Createing the pdffile before validation because joi cant handle it for some reason and I can't fix the underlying issue / I want to make progress, wasted like 3 hours on this already. TODO: The casting should be done in JoiPDFFileSchema.ts if done correctly...
        const files = inputRef.current?.files;
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

        const validationResults = schema.validate({input: inputs, values: action.values});

        if(validationResults.error) {
            console.error({error: "Validation failed", details: validationResults.error.message}, validationResults.error.stack);
        }
        else {
            action.values = validationResults.value.values;
            const Operator = (await getOperatorByName(operatorInternalName))!;

            const operation = new Operator(action);
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
            <h1>{ schema?.describe().flags.label }</h1>
            <h2>{ schema?.describe().flags.description }</h2>

            <InputField ref={inputRef} />

            <div id="values">
                <BuildForm schemaDescription={schema?.describe()} onSubmit={handleSubmit}></BuildForm>
            </div>
        </Fragment>
    );
}


export default Dynamic;
