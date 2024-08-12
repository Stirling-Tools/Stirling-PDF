import { useEffect, useRef, useState } from 'react';

import { getSchemaByName } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";

import styles from './OperatorCard.module.css';
import { MaterialSymbol, MaterialSymbolProps } from 'react-material-symbols';

interface OperatorCardProps {
    /** The text to display inside the button */
    operatorInternalName: string;
}

export function OperatorCard({ operatorInternalName }: OperatorCardProps) {
    const [schema, setSchema] = useState<any>(undefined); // TODO: Type as joi type
    const [materialSymbolName, setMaterialSymbolName] = useState<MaterialSymbolProps["icon"]>("error");

    useEffect(() => {
        getSchemaByName(operatorInternalName).then(schema => {
            if(schema) {
                setSchema(schema.schema);
                setMaterialSymbolName(schema.materialSymbolName || "error");
            }
        });
    }, [operatorInternalName]);

    return (
        <a key={operatorInternalName} href={"/operators/" + operatorInternalName}>
            <div className={styles.operator_card}>
                <h3><MaterialSymbol icon={materialSymbolName} size={30} fill grade={-25} color='black'></MaterialSymbol> { schema?.describe().flags.label }</h3>
                { schema?.describe().flags.description }
            </div>
        </a>
    );
}