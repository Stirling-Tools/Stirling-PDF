package stirling.software.saas.procurement.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A linked team's enterprise commercial journey (one per team). Stage mirrors the buyer journey the
 * processor renders (trial -&gt; quote -&gt; agreement -&gt; payment -&gt; live). The entitlement that
 * actually unlocks the product is the Keygen licence in {@code licenseRef}; the paid subscription,
 * once commercial, is mirrored in {@code billing_subscriptions} and referenced by {@code
 * subscriptionId}.
 */
@Entity
@Table(name = "procurement_deal")
@NoArgsConstructor
@Getter
@Setter
public class ProcurementDeal implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Interest, before any commitment: the account asked about enterprise but has not started a
     * trial. Kept as a real stage so intent survives a refresh, so the enterprise surface is only
     * shown to accounts that asked for it, and so drop-off at the cheapest step is measurable.
     */
    public static final String STAGE_EXPLORING = "exploring";

    public static final String STAGE_TRIAL = "trial";
    public static final String STAGE_QUOTE = "quote";
    public static final String STAGE_AGREEMENT = "security";
    public static final String STAGE_PAYMENT = "procurement";
    public static final String STAGE_LIVE = "active";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "deal_id")
    private Long dealId;

    @Column(name = "team_id", nullable = false, unique = true)
    private Long teamId;

    @Column(name = "stage", nullable = false, length = 32)
    private String stage = STAGE_TRIAL;

    // Deployment target + seat count captured at trial start (the setup step); they seed the quote
    // builder so it opens on the buyer's real environment. The quote remains the commercial source
    // of truth — these are just the starting point, editable when the quote is built.
    @Column(name = "deployment", nullable = false, length = 16)
    private String deployment = "cloud";

    @Column(name = "seats", nullable = false)
    private int seats;

    @Column(name = "trial_started_at")
    private LocalDateTime trialStartedAt;

    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    @Column(name = "trial_extensions_used", nullable = false)
    private int trialExtensionsUsed;

    // Captured at trial setup, so the buying entity is known before any quote exists — the quote's
    // own copies seed from these and may then diverge (a deal can change hands mid-cycle).
    // Nullable: trials started before this step, and older clients, supply none.
    @Column(name = "business_name", length = 255)
    private String businessName;

    @Column(name = "contact_name", length = 255)
    private String contactName;

    @Column(name = "contact_email", length = 320)
    private String contactEmail;

    // Addresses the buyer named at setup. Kept as the record of what was asked for; the invitations
    // themselves go out through the team-invite path when the trial starts.
    @Column(name = "invite_emails", length = 2000)
    private String inviteEmails;

    @Column(name = "license_ref", length = 128)
    private String licenseRef;

    @Column(name = "subscription_id", length = 255)
    private String subscriptionId;

    /**
     * The last Stripe invoice whose payment was applied to this deal. Distinguishes a redelivered
     * {@code invoice.paid} for a payment already handled from a genuine renewal, which has to
     * re-issue: the committed licence expires term years from issue, so a renewal that doesn't
     * re-issue leaves the licence lapsing after the customer has paid.
     */
    @Column(name = "last_paid_invoice_id", length = 255)
    private String lastPaidInvoiceId;

    @Column(name = "accepted_quote_id")
    private Long acceptedQuoteId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public ProcurementDeal(Long teamId) {
        this.teamId = teamId;
    }
}
