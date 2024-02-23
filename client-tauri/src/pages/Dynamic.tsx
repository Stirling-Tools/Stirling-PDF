import { Link } from "react-router-dom";

import { BaseSyntheticEvent, createContext, useState } from "react";
import { Operator } from "@stirling-pdf/shared-operations/src/functions";
import i18next from "i18next";
import Joi from "@stirling-tools/joi";
import { BuildFields } from "../components/fields/BuildFields";

function Dynamic() {
    const [schemaDescription, setSchemaDescription] = useState<Joi.Description>();


    const operators = ["impose"]; // TODO: Make this dynamic

    function selectionChanged(s: BaseSyntheticEvent) {
        const selectedValue = s.target.value;
        if(selectedValue == "none") {
            setSchemaDescription(undefined);
            return;
        }

        i18next.loadNamespaces("impose", (err, t) => {
            if (err) throw err;

            const LoadingModule = import(`@stirling-pdf/shared-operations/src/functions/${selectedValue}`) as Promise<{ [key: string]: typeof Operator }>;
            LoadingModule.then((Module) => {
                const Operator = Module[capitalizeFirstLetter(selectedValue)];
                const description = Operator.schema.describe();

                setSchemaDescription(description); // This will update children
                console.log(description);
            });
        });
    }

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
                    return (<option value={operator}>{operator}</option>)
                }) }
            </select>

            <div id="values">
                <BuildFields schemaDescription={schemaDescription}></BuildFields>
            </div>

            <br />
            <button id="processButton">Process process file with current settings</button>

            <p>
                <Link to="/">Go back home...</Link>
            </p>
        </div>
    );
}


export default Dynamic;
