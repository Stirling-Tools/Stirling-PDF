package stirling.software.proprietary.integration.model;

/** Kind of external integration a stored config describes. */
public enum IntegrationType {
    S3,
    /** A network file server (SFTP, FTP/FTPS, or SMB/Samba) a policy source polls for documents. */
    NETWORK,
    MCP,
    /** A generic outbound HTTP endpoint a pipeline step can post a document to. */
    API,
    /** Microsoft Purview Information Protection: sensitivity-label taxonomy via Graph. */
    PURVIEW,
    /** ConsignO Cloud (Notarius) e-signature and notarization. */
    CONSIGNO,
    VECTOR_DB,
    /** A Microsoft Entra app registration that reads and writes OneDrive and SharePoint files. */
    MICROSOFT_365,
    /** A Google service account that reads and writes Google Drive for the organisation. */
    GOOGLE_WORKSPACE
}
