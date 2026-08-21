package stirling.software.saas.procurement.legal;

/**
 * The buyer-supplied inputs captured at the moment of signing the enterprise agreement: the legal
 * entity name, the signatory's typed name and title, and their representation of authority to bind.
 * Null when the agreement is rendered for preview (before signing).
 */
public record AgreementSigning(
        String customerLegalName,
        String signatoryName,
        String signatoryTitle,
        boolean authorityConfirmed) {}
