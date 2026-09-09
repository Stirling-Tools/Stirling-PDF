package stirling.software.saas.procurement.license;

/**
 * The committed deal's entitlements, stamped onto the annual Keygen licence's metadata so the
 * licence is a self-describing record of what was bought. Only {@code seats} (as {@code users}) and
 * the enterprise flag are read by the self-hosted verifier; the rest is informational — kept "for
 * good measure" so the Keygen dashboard and any downstream reconciliation can see the full picture.
 * Built by {@code ProcurementService} from the accepted quote + deal.
 */
public record LicenseEntitlements(
        long volume, // committed PDFs / year
        int seats, // 0 = unlimited
        String deployment, // cloud | selfhost | airgap
        int termYears,
        String serviceLevel, // standard | priority | dedicated
        boolean indemnification,
        boolean training,
        boolean qbr,
        boolean offlineLicense,
        Long dealId,
        String subscriptionId) {}
