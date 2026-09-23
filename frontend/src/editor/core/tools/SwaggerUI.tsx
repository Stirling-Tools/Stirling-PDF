import React, { useEffect } from "react";
import { BaseToolProps } from "@app/types/tool";
import { withBasePath } from "@app/constants/app";
import { useTranslation } from "react-i18next";

const SwaggerUI: React.FC<BaseToolProps> = () => {
  const { t } = useTranslation();
  useEffect(() => {
    // Redirect to Swagger UI
    window.open(withBasePath("/swagger-ui/5.21.0/index.html"), "_blank");
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <p>{t("swagger.opening", "Opening Swagger UI in a new tab...")}</p>
      <p>
        {t("swagger.fallback", "If it didn't open automatically,")}{" "}
        <a
          href={withBasePath("/swagger-ui/5.21.0/index.html")}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("swagger.clickHere", "click here")}
        </a>
      </p>
    </div>
  );
};

export default SwaggerUI;
