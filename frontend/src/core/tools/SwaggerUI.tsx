import React, { useEffect } from "react";
import { BaseToolProps } from "@app/types/tool";
import { withBasePath } from "@app/constants/app";
import { openExternalUrl } from "@app/utils/openExternalUrl";

const SwaggerUI: React.FC<BaseToolProps> = () => {
  useEffect(() => {
    // Redirect to Swagger UI
    void openExternalUrl(withBasePath("/swagger-ui/5.21.0/index.html"));
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <p>Opening Swagger UI in a new tab...</p>
      <p>
        If it didn't open automatically,{" "}
        <a href={withBasePath("/swagger-ui/5.21.0/index.html")} target="_blank" rel="noopener noreferrer">
          click here
        </a>
      </p>
    </div>
  );
};

export default SwaggerUI;
