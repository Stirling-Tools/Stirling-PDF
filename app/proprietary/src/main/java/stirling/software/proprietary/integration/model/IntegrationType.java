package stirling.software.proprietary.integration.model;

/** Kind of external integration a stored config describes. */
public enum IntegrationType {
    S3,
    MCP,
    /** A generic outbound HTTP endpoint a pipeline step can post a document to. */
    API,
    /** Microsoft Purview Information Protection: sensitivity-label taxonomy via Graph. */
    PURVIEW,
    /** ConsignO Cloud (Notarius) e-signature and notarization. */
    CONSIGNO
}
