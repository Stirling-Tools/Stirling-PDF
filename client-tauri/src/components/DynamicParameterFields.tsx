
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { FieldConstraint, RecordConstraint } from '@stirling-pdf/shared-operations/src/dynamic-ui/OperatorConstraints'

interface DynamicParameterFieldsProps {
    constraints: RecordConstraint;
    parentKeyPath?: string[];
}

const DynamicParameterFields: React.FC<DynamicParameterFieldsProps> = ({constraints, parentKeyPath=["DPF"]}) => {
    const { t } = useTranslation();

    return (<>
        {Object.entries(constraints.record).map(([fieldName, value]) => {
            console.log(fieldName, value)
            const globallyUniqueId = joinKeyPath([...parentKeyPath, fieldName]);
            return <div className='mb-3' key={fieldName} >
                <label htmlFor={globallyUniqueId}>{t(value.displayNameKey)}</label>
                {fieldConstraintToElement(fieldName, parentKeyPath, globallyUniqueId, value)}
            </div>
        })}
    </>);
}

function joinKeyPath(keyPath: string[]) {
    return keyPath.join(".");
}

function fieldConstraintToElement(fieldName: string, parentKeyPath: string[], globallyUniqueId: string, fieldConstraint: FieldConstraint) {
    if (Array.isArray(fieldConstraint.type)) {
        if (fieldConstraint.type.every(e => typeof e == 'string' || typeof e == 'number')) {
            return (
                <Form.Select id={globallyUniqueId} name={fieldName}>
                    <option value="" disabled>Select an option</option>
                    {fieldConstraint.type.map((option) => <option key={option} value={option}>{option}</option> )}
                </Form.Select>
            );
        } else {
            return <div key={fieldName}>Error: Field type '{fieldConstraint.type}' not supported</div>
        }
    } else if (typeof fieldConstraint.type == 'string') {
        switch (fieldConstraint.type) {
            case "file.pdf":
                return <input id={globallyUniqueId} type="file" name={fieldName} required={fieldConstraint.required} className="form-control required" accept="application/pdf" multiple={false}/>;
            case "files.pdf":
                return <input id={globallyUniqueId} type="file" name={fieldName} required={fieldConstraint.required} className="form-control required" accept="application/pdf" multiple={true}/>;
            case "string":
                return <input id={globallyUniqueId} type="text" name={fieldName} required={fieldConstraint.required} />;
            case "number":
                return <input id={globallyUniqueId} type="number" name={fieldName} required={fieldConstraint.required} />;
            default:
                return <div key={fieldName}>Error: Field type '{fieldConstraint.type}' not supported</div>
        }
    } else if (fieldConstraint.type instanceof RecordConstraint) {
        //return <DynamicParameterFields constraints={fieldConstraint.type} parentKeyPath={[...parentKeyPath, fieldName]}/>
        return <div key={fieldName}>Error: Field type 'RecordConstraint' not supported yet!</div>
    }

    return <div key={fieldName}>Error: Field type '{fieldConstraint.type}' not supported</div>
}

export default DynamicParameterFields;