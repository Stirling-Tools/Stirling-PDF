import { Link } from "react-router-dom";

import { BaseSyntheticEvent } from "react";
import { Operator } from "@stirling-pdf/shared-operations/src/functions";
import i18next from "i18next";

function Dynamic() {
    const operators = ["impose"]; // TODO: Make this dynamic

    function selectionChanged(s: BaseSyntheticEvent) {
        const selectedValue = s.target.value;
        if(selectedValue == "none") return;

        i18next.loadNamespaces("impose", (err, t) => {
            if (err) throw err;

            const LoadingModule = import(`@stirling-pdf/shared-operations/src/functions/${selectedValue}`) as Promise<{ [key: string]: typeof Operator }>;
            LoadingModule.then((Module) => {
                const Operator = Module[capitalizeFirstLetter(selectedValue)];
                const description = Operator.schema.describe();

                console.log(description);
                // TODO: use description to generate fields
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

            <br />
            <textarea name="workflow" id="workflow"></textarea>
            <br />
            <select id="pdfOptions" onChange={selectionChanged}>
                <option value="none">none</option>
                { operators.map((operator, i) => {
                    return (<option value={operator}>{operator}</option>)
                }) }
            </select>
            <button id="loadButton">Load</button>
            <br />

            <br />
            <button id="doneButton">Done</button>

            <p>
                <Link to="/">Go back home...</Link>
            </p>
        </div>
    );
}


export default Dynamic;
