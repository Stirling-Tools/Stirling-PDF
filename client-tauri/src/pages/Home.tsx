import { Link } from "react-router-dom";
import { getOperatorByName, getSchemaByName, listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";

import styles from './home.module.css'; 

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
                        return (<a key={operator} href={"/operators/" + operator}><div className={styles.operator_card}>{operator}</div></a>)
                    })
                }
            </div>


            <Link to="/dynamic">Dynamic</Link>
        </div>
    );
}

export default Home;