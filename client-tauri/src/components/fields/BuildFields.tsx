import Joi from "@stirling-tools/joi";


interface BuildFieldsProps {
    /** The text to display inside the button */
    schemaDescription: Joi.Description | undefined;
}
  

export function BuildFields({ schemaDescription }: BuildFieldsProps) {
    console.log("Render Build Fields", schemaDescription);
    return (
      <div>Description: {(schemaDescription?.flags as any)?.description}</div>
    );
}