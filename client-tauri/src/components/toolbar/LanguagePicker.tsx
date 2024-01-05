
import NavDropdown from "react-bootstrap/NavDropdown";
import { useTranslation } from "react-i18next";
import { BsGlobe2 } from "react-icons/bs";

function generateSublist() {
    const { i18n } = useTranslation();
    const out: JSX.Element[] = [];
    const languages = i18n.options.resources;
    for (const key in languages) {
        const lang: any = languages[key].translation;
        const staticKey = key;
        out.push((
            <NavDropdown.Item key={"language-"+key} className="nav-icon" onClick={()=>i18n.changeLanguage(staticKey)}>
                <span>{lang.language?.flag}</span>
                <span>{lang.language?.name}</span>
            </NavDropdown.Item>
        ));
    }
    return <>{out}</>;
}

export default function LanguagePicker() {
    return (
        <NavDropdown id="languages-dropdown" title={<><span className="nav-icon"><BsGlobe2/></span></>}>
            {generateSublist()}
        </NavDropdown>
    );
}
