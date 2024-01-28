import { Link } from "react-router-dom";

import { listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/getOperatorByName"
import { Impose } from "@stirling-pdf/shared-operations/src/functions/impose"
import { BaseSyntheticEvent } from "react";

function Dynamic() {
    console.log(listOperatorNames());
    
    const operators = listOperatorNames();
    
    function selectionChanged(s: BaseSyntheticEvent) {
        const selectedValue = s.target.value;
        if(selectedValue == "none") return;
        const LoadedOperator = import(`../shared-operations/src/functions/${selectedValue}`);
        LoadedOperator.then(console.log);
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
                {operators.map((operator, i) => { 
                    return (<option value={operator}>{operator}</option>) 
                })}
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