import { useEffect, useState } from 'react';

import { getSchemaByName } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";

import styles from './OperatorCard.module.css';
interface OperatorCardProps {
    /** The text to display inside the button */
    operatorInternalName: string;
}

export function OperatorCard({ operatorInternalName }: OperatorCardProps) {
    const [schema, setSchema] = useState<any>(undefined); // TODO: Type as joi type

    useEffect(() => {
        getSchemaByName(operatorInternalName).then(schema => {
            if(schema) {
                setSchema(schema.schema);
            }
        });
    }, [operatorInternalName]);

    return (
        <a key={operatorInternalName} href={"/operators/" + operatorInternalName}>
            <div>

            </div>
            <div className={styles.operator_card}>
                <h3>{ schema?.describe().flags.label }</h3>
                { schema?.describe().flags.description }
            </div>
        </a>
    );
}