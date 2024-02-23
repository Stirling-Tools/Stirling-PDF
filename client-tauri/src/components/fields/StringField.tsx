interface StringFieldProps {
    /** The text to display inside the button */
    validValues: string[];
    exampleValues: string;
}
  

export function StringField({ validValues, exampleValues }: StringFieldProps) {
    return (
      <button>{validValues}</button>
    );
}