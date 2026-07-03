package stirling.software.saas.procurement.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/** Tunables for the enterprise procurement flow. Prefix {@code stirling.procurement}. */
@Getter
@Setter
@Component
@Profile("saas")
@ConfigurationProperties(prefix = "stirling.procurement")
public class ProcurementConfigurationProperties {

    /** Free trial length, in days (no card). */
    private int trialDurationDays = 14;

    /** Days added per trial extension. */
    private int trialExtensionDays = 15;

    /** Maximum number of trial extensions a buyer may take. */
    private int maxTrialExtensions = 2;

    /**
     * Enables the demo-only endpoints (POST /reset, POST /go-live) that reset a team's procurement
     * or mark it live without payment. Off by default; turn on ONLY in demo/dev environments —
     * /go-live is a stand-in for the invoice.paid webhook and would let a leader activate unpaid.
     */
    private boolean demoControlsEnabled = false;

    /**
     * Supabase edge function the portal calls to turn an accepted quote into a Stripe Checkout
     * session (Stripe lives in the edge layer, not Java). The portal builds the full URL.
     */
    private String checkoutFunction = "create-procurement-checkout";
}
