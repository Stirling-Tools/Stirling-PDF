import React, { useEffect } from "react";
import { BaseToolProps } from "../types/tool";
import { withBasePath } from "../constants/app";

const SwaggerUI: React.FC<BaseToolProps> = () => {
  useEffect(() => {
    // Redirect to Swagger UI
    window.open(withBasePath("/swagger-ui/5.21.0/index.html"), "_blank");
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <p>Opening Swagger UI in a new tab...</p>
      <p>
        If it didn&apos;t open automatically,{" "}
        <a href={withBasePath("/swagger-ui/5.21.0/index.html")} target="_blank" rel="noopener noreferrer">
          click here
        </a>
      </p>
    </div>
  );
};

export default SwaggerUI;
