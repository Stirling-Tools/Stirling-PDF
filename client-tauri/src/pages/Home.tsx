import { Link } from "react-router-dom";

import { listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";
import { OperatorCard } from "../components/OperatorCard";


import styles from './Home.module.css'; 

function Home() {
    const operators = listOperatorNames();

    return (
        <div>
            <h1>
                Stirling PDF
            </h1>
            <h2>
                Your locally hosted one-stop-shop for all your PDF needs
            </h2>

            {/**TODO: Search bar */}

            <div className={styles.operator_container}>
                {
                    operators.map((operator) => {
                        return (<OperatorCard key={operator} operatorInternalName={operator}></OperatorCard>)
                    })
                }
            </div>
        </div>
    );
}

export default Home;