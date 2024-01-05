
import { isLibreOfficeInstalled } from "../../utils/libre-office-utils";

const hasLibreOffice = await isLibreOfficeInstalled();
console.log(hasLibreOffice);

function About() {
    return (
        <div>
            <h2>Convert to PDF</h2>
            {"hasLibreOffice: "+hasLibreOffice}
        </div>
    );
}

export default About;
