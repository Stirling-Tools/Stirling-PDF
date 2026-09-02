package stirling.software.saas.procurement.config;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.Getter;
import lombok.Setter;

/** Tunables for the enterprise procurement flow. Prefix {@code stirling.procurement}. */
@Getter
@Setter
@ApplicationScoped
@IfBuildProfile("saas")
@ConfigurationProperties(prefix = "stirling.procurement")
public class ProcurementConfigurationProperties {

    /** Free trial length, in days (no card). */
    private int trialDurationDays = 14;

    /** Days added per trial extension. */
    private int trialExtensionDays = 7;

    /** Maximum number of trial extensions a buyer may take. */
    private int maxTrialExtensions = 2;

    /**
     * Enables the demo-only endpoints (POST /reset, POST /go-live) that reset a team's procurement
     * or mark it live without payment. Off by default; turn on ONLY in demo/dev environments —
     * /go-live is a stand-in for the invoice.paid webhook and would let a leader activate unpaid.
     */
    private boolean demoControlsEnabled = false;

    /**
     * Smallest annual fee, in minor units, that may be quoted. The pricing curve has no natural
     * floor — a small enough committed volume rounds the meter to zero — and every registered user
     * is the leader of their own team, so without this any signup could price a $0 enterprise
     * quote, accept it, and be provisioned a committed licence. 12_000_00 is USD 12,000/yr, the
     * self-hosted deploy fee, chosen so the floor cannot sit below a line item the quote itself can
     * contain.
     *
     * <p>This is a commercial number, not a technical one: set it to whatever the smallest
     * enterprise deal you will actually sign is. Zero disables the check.
     */
    private long minAnnualNetMinor = 12_000_00L;
}
