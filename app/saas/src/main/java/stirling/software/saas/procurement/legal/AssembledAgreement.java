package stirling.software.saas.procurement.legal;

/**
 * A rendered enterprise agreement: the full markdown the buyer sees (MSA + Order Form + DPA, tokens
 * filled), plus the registry metadata that pins it. {@code variablesJson} is the exact set of
 * Order-Form values as rendered, stored alongside a signature so the document is reproducible.
 */
public record AssembledAgreement(
        String docId,
        String version,
        String versionLabel,
        String displayName,
        String effectiveDate,
        String status,
        String markdown,
        String variablesJson) {}
