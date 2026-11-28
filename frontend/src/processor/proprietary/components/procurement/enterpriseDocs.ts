/** The pages of the Stirling docs the Enterprise page links to. */
const DOCS = "https://docs.stirlingpdf.com";

export const ENTERPRISE_DOCS = {
  cloud: `${DOCS}/Cloud/`,
  server: `${DOCS}/Server/`,
  docker: `${DOCS}/Server/Install/Docker/`,
  kubernetes: `${DOCS}/Server/Install/Kubernetes/`,
  licence: `${DOCS}/Server/Licensing/Plans-and-Licences/`,
  offlineLicence: `${DOCS}/Server/Licensing/Plans-and-Licences/#activating-your-license`,
  sso: `${DOCS}/Server/Security/OAuth-SSO/`,
  saml: `${DOCS}/Server/Security/SAML-SSO/`,
  ocr: `${DOCS}/Server/Operations/OCR-Languages/`,
} as const;
