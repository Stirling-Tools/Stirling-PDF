
import DynamicParameterFields from "../../components/DynamicParameterFields";
// import { ImposeParamConstraints } from "@stirling-pdf/shared-operations/src/functions/impose";
import { useTranslation } from "react-i18next";

function Impose() {
    const { t } = useTranslation();
    return (
        <div>
            <h2>{t("pageLayout.header")}</h2>
            <form>
                {/* <DynamicParameterFields constraints={ImposeParamConstraints}/> */}
            </form>
        </div>
    );
}

export default Impose;
