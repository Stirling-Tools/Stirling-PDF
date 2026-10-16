package stirling.software.proprietary.serverregistration;

import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Tracking-only wire contract. Counts exclude the internal API user and never convey entitlement.
 */
public final class ServerRegistrationProtocol {
    public static final String PATH = "/api/v1/server-license/registrations";
    public static final int CAPABILITY_VERSION = 1;

    private ServerRegistrationProtocol() {}

    /**
     * A monotonic sequence is reserved durably before sending; receipt time determines freshness.
     */
    public record Report(
            @NotNull @Min(1) Long sequence,
            @NotNull @Min(0) @Max(Integer.MAX_VALUE) Long reportedUserCount,
            @NotBlank @Size(max = 80) String applicationVersion,
            @Min(1) @Max(1) int capabilityVersion) {}

    /**
     * The installation creates and saves its secret before bootstrap so a lost reply is
     * recoverable.
     */
    public record RegistrationRequest(
            @NotNull UUID installationId,
            @NotBlank @Size(max = 65536) String licenseProof,
            @NotBlank @Size(max = 256) String machineFingerprint,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String registrationSecret,
            @NotNull @Valid Report report) {
        @Override
        public String toString() {
            return "RegistrationRequest[installationId="
                    + installationId
                    + ", credentials=REDACTED]";
        }
    }

    /** This secret authenticates only this tracking record, never a human or Team connection. */
    public record SyncRequest(
            @NotNull UUID registrationId,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String registrationSecret,
            @NotNull @Valid Report report) {
        @Override
        public String toString() {
            return "SyncRequest[registrationId=" + registrationId + ", credential=REDACTED]";
        }
    }

    public enum PurchaseMapping {
        RESOLVED,
        UNRESOLVED
    }

    /**
     * Acknowledges accepted tracking data only; no migration or entitlement instruction exists
     * here.
     */
    public record Receipt(
            UUID registrationId, long acceptedSequence, PurchaseMapping purchaseMapping) {}
}
