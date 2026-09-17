package stirling.software.proprietary.security.configuration.ee;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@ExtendWith(MockitoExtension.class)
class LicenseKeyCheckerTest {

    @Mock private KeygenLicenseVerifier verifier;
    @Mock private UserLicenseSettingsService userLicenseSettingsService;

    @Test
    void bootGateRefreshesTeamBeforeRejectingPaidConfiguration() {
        ApplicationProperties properties = new ApplicationProperties();
        when(userLicenseSettingsService.refreshLinkedTeamUsers())
                .thenThrow(new IllegalStateException("Database not initialized"))
                .thenReturn(300);
        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, properties, userLicenseSettingsService);
        checker.init();
        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
        assertThatCode(() -> checker.requireProOrEnterprise("storage.provider=s3"))
                .doesNotThrowAnyException();
        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
        verifyNoInteractions(verifier);
    }

    @Test
    void repeatedTierQueriesCollapseIntoOneEntitlementRead() {
        // /app-config asks the tier several times per page load; each miss was its own DB read.
        ApplicationProperties properties = new ApplicationProperties();
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(300);
        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, properties, userLicenseSettingsService);

        assertEquals(License.SERVER, checker.premiumTier());
        assertEquals(License.SERVER, checker.premiumTier());
        assertEquals(License.SERVER, checker.premiumTier());

        verify(userLicenseSettingsService, times(1)).refreshLinkedTeamUsers();
    }

    @Test
    void anUnreadableEntitlementIsRetried_notMemoised() {
        // The failure path must not stamp the memo, or a transient DB error would freeze the tier
        // for the whole window instead of being retried on the next question.
        ApplicationProperties properties = new ApplicationProperties();
        when(userLicenseSettingsService.refreshLinkedTeamUsers())
                .thenThrow(new IllegalStateException("Database not initialized"))
                .thenReturn(300);
        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, properties, userLicenseSettingsService);

        assertEquals(License.NORMAL, checker.premiumTier());
        assertEquals(License.SERVER, checker.premiumTier());

        verify(userLicenseSettingsService, times(2)).refreshLinkedTeamUsers();
    }

    @Test
    void anInstalledKeyNeedsNoEntitlementRead() {
        // A paid key short-circuits the promotion, so the linked-team lookup never runs at all.
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPremium().setEnabled(true);
        properties.getPremium().setKey("a-key");
        when(verifier.verifyLicense("a-key")).thenReturn(License.ENTERPRISE);
        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, properties, userLicenseSettingsService);
        checker.init();

        assertEquals(License.ENTERPRISE, checker.premiumTier());
        assertEquals(License.ENTERPRISE, checker.premiumTier());

        verify(userLicenseSettingsService, never()).refreshLinkedTeamUsers();
    }

    @Test
    void premiumDisabled_skipsVerification() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        props.getPremium().setKey("dummy");

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
        verifyNoInteractions(verifier);
    }

    @Test
    void directKey_verified() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("abc");
        when(verifier.verifyLicense("abc")).thenReturn(License.SERVER);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
        verify(verifier).verifyLicense("abc");
    }

    @Test
    void fileKey_verified(@TempDir Path temp) throws IOException {
        Path file = temp.resolve("license.txt");
        Files.writeString(file, "filekey");

        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("file:" + file);
        when(verifier.verifyLicense("filekey")).thenReturn(License.ENTERPRISE);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.ENTERPRISE, checker.getPremiumLicenseEnabledResult());
        verify(verifier).verifyLicense("filekey");
    }

    @Test
    void missingFile_resultsNormal(@TempDir Path temp) {
        Path file = temp.resolve("missing.txt");
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("file:" + file);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
        verifyNoInteractions(verifier);
    }

    // ----- requireProOrEnterprise: shared boot-time gate for premium features -----

    @Test
    void requireProOrEnterprise_normalLicense_throwsWithFeatureName() {
        LicenseKeyChecker checker = checkerWithLicense(License.NORMAL);
        assertThatThrownBy(() -> checker.requireProOrEnterprise("storage.provider=s3"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("storage.provider=s3 requires a Pro or Enterprise license");
    }

    @Test
    void requireProOrEnterprise_serverLicense_passes() {
        LicenseKeyChecker checker = checkerWithLicense(License.SERVER);
        assertThatCode(() -> checker.requireProOrEnterprise("any.feature=true"))
                .doesNotThrowAnyException();
    }

    @Test
    void requireProOrEnterprise_enterpriseLicense_passes() {
        LicenseKeyChecker checker = checkerWithLicense(License.ENTERPRISE);
        assertThatCode(() -> checker.requireProOrEnterprise("any.feature=true"))
                .doesNotThrowAnyException();
    }

    /**
     * The single injection point for cloud-sold Team, which issues no licence key. Every licence
     * consumer reads getPremiumLicenseEnabledResult(), so promoting that one field is what lights
     * them up; the tests below pin the boundaries the promotion must not cross.
     */
    @Test
    void teamPlan_promotesToServerWithNoLicenceKey() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(100);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
        // The key granted nothing, which is what keeps the seat arithmetic off premium.maxUsers.
        assertEquals(License.NORMAL, checker.getLicenseKeyResult());
        verifyNoInteractions(verifier);
    }

    /**
     * premium.enabled is how an operator declares they hold a licence. A Team buyer has none to
     * declare and never edits settings.yml, so the promotion sits outside that gate.
     */
    @Test
    void teamPlan_promotesEvenWhenPremiumIsDisabled() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        props.getPremium().setKey("dummy");
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(100);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
    }

    /**
     * Enterprise is contracted and stays licence-only, so runningEE and every @EnterpriseEndpoint
     * keep requiring a real key however much capacity the cloud team bought.
     */
    @Test
    void teamPlan_neverPromotesToEnterprise() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(100000);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
    }

    /** Precedence is an OR: a licence that already grants more is not lowered to SERVER. */
    @Test
    void enterpriseLicence_outranksTheTeamPlan() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("ent");
        when(verifier.verifyLicense("ent")).thenReturn(License.ENTERPRISE);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.ENTERPRISE, checker.getPremiumLicenseEnabledResult());
        // The holding is not even consulted once the key already grants more.
        verify(userLicenseSettingsService, never()).refreshLinkedTeamUsers();
    }

    @Test
    void noTeamPlan_staysNormal() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(null);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
    }

    /**
     * init() is a @PostConstruct, so it runs long before the datasource exists. The row read
     * therefore throws rather than answering, and boot has to survive it -- the promotion is the
     * tier beans' job, not this one's.
     */
    @Test
    void unreadableHolding_doesNotBreakBoot() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers())
                .thenThrow(new IllegalStateException("no datasource yet"));

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);

        assertThatCode(checker::init).doesNotThrowAnyException();
        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
    }

    /** ApplicationReadyEvent is the backstop for an instance whose row was unreadable earlier. */
    @Test
    void applicationReady_appliesThePromotionTheBootReadCouldNotSee() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers())
                .thenThrow(new IllegalStateException("no datasource yet"))
                .thenReturn(100);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();
        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());

        checker.onApplicationReady();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
        verify(userLicenseSettingsService).updateLicenseMaxUsers();
    }

    /**
     * The seam between the daily sync and the tier. The sync refreshes the entitlement for its own
     * reasons and says so; nothing re-read the plan on the back of it, which is how a purchase
     * could sit unnoticed until the weekly Keygen recheck.
     */
    @Test
    void entitlementRefresh_promotesWithoutWaitingForTheLicenceRecheck() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        // Unreadable at boot, as it is on a real start: no datasource yet.
        when(userLicenseSettingsService.refreshLinkedTeamUsers())
                .thenThrow(new IllegalStateException("no datasource"));

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();
        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());

        // What the sync's event stands for: the plan is now readable and says 100 users.
        reset(userLicenseSettingsService);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(100);
        checker.onEntitlementRefreshed();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
        // Still no Keygen round trip: the whole point is that this is the cheap path.
        verifyNoInteractions(verifier);
    }

    /** A cancellation travels the same seam, and must not need a restart either. */
    @Test
    void entitlementRefresh_demotesWhenThePlanIsGone() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(100);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();
        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());

        reset(userLicenseSettingsService);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(null);
        checker.onEntitlementRefreshed();

        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
    }

    /** A read that throws leaves the tier where it was rather than silently demoting a payer. */
    @Test
    void entitlementRefresh_keepsTheTierWhenTheReadFails() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        when(userLicenseSettingsService.refreshLinkedTeamUsers()).thenReturn(100);

        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();

        reset(userLicenseSettingsService);
        when(userLicenseSettingsService.refreshLinkedTeamUsers())
                .thenThrow(new IllegalStateException("SaaS unreachable"));
        checker.onEntitlementRefreshed();

        assertEquals(License.SERVER, checker.getPremiumLicenseEnabledResult());
    }

    private LicenseKeyChecker checkerWithLicense(License level) {
        ApplicationProperties props = new ApplicationProperties();
        if (level == License.NORMAL) {
            props.getPremium().setEnabled(false);
        } else {
            props.getPremium().setEnabled(true);
            props.getPremium().setKey("any");
            when(verifier.verifyLicense("any")).thenReturn(level);
        }
        LicenseKeyChecker checker =
                new LicenseKeyChecker(verifier, props, userLicenseSettingsService);
        checker.init();
        return checker;
    }
}
