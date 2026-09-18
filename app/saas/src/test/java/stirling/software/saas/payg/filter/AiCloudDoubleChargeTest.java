package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.proprietary.accountlink.BillableOperationClassifier;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.saas.payg.cap.AiToolRoutes;

/**
 * Which AI paths would be charged twice if a linked self-hosted instance ever ran its AI on Stirling
 * Cloud.
 *
 * <p>The two meters are independent and neither knows the other exists. A self-hosted instance bills
 * locally through {@code InstanceEntitlementInterceptor} and reports the total to
 * {@code /api/v1/instance/sync}; the cloud bills live through {@link PaygChargeInterceptor}. Both
 * land as a DEBIT on the same team's {@code wallet_ledger}. So for any path where <b>both</b>
 * classifiers say "billable", one user action costs the customer two charges.
 *
 * <p>That is not a live bug: cloud AI does not exist, and {@code
 * stirling.billing.account-link.metering.enabled} defaults to false. It is the constraint on
 * building it - whoever adds a cloud mode has to stop one of the two meters, and this test says
 * exactly how wide the problem is.
 *
 * <p>The nightly sync is <b>not</b> the risk: it bills {@code cumulative - lastCumulative} behind a
 * monotonic {@code syncSeq}, so a resend is worth zero. The risk is the live double-accrual.
 *
 * <p>Note also that the local dedup window cannot save this. Its key comes from the automation
 * headers and is only read when {@code X-Stirling-Automation} is present, so an interactive AI call
 * has a null key and always charges.
 *
 * @see PaygBillingParityTest for the matrix asserting the two deployments agree on a category
 */
class AiCloudDoubleChargeTest {

    /** {@code doubleCharges} = both meters bill it, so one action would cost two charges. */
    private record AiPath(String name, String uri, boolean doubleCharges) {
        @Override
        public String toString() {
            return name;
        }
    }

    private static Stream<AiPath> aiPaths() {
        return Stream.of(
                // The document-tool namespace is the whole exposure.
                new AiPath("pdf comment agent", "/api/v1/ai/tools/pdf-comment-agent", true),
                new AiPath("math auditor", "/api/v1/ai/tools/math-auditor-agent", true),
                // The engine's own surface is reasoning and health, deliberately never charged, so
                // it stays safe even once a cloud mode exists.
                new AiPath("orchestrate", "/api/v1/ai/orchestrate", false),
                new AiPath("orchestrate stream", "/api/v1/ai/orchestrate/stream", false),
                new AiPath("engine pdf edit", "/api/v1/ai/pdf/edit", false),
                new AiPath("engine health", "/api/v1/ai/health", false),
                new AiPath("engine status", "/api/v1/ai/status", false),
                // Not AI at all; here so a prefix widened by accident fails loudly.
                new AiPath("ordinary tool", "/api/v1/security/add-password", false));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("aiPaths")
    void bothMetersAgreeOnWhichAiPathsWouldBeChargedTwice(AiPath path) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path.uri());
        request.setRequestURI(path.uri());

        // Self-hosted: an interactive call with no API key and no automation header.
        BillingCategory selfHosted = BillableOperationClassifier.categorize(request, false);
        boolean selfHostedBills = selfHosted == BillingCategory.AI;

        // Cloud: the same request, as the charge interceptor and entitlement guard scope it.
        boolean cloudBills = AiToolRoutes.matches(request);

        assertThat(selfHostedBills)
                .as("self-hosted meter bills %s as AI", path.uri())
                .isEqualTo(path.doubleCharges());
        assertThat(cloudBills)
                .as("cloud meter bills %s as AI", path.uri())
                .isEqualTo(path.doubleCharges());
        assertThat(selfHostedBills && cloudBills)
                .as(
                        "%s would be charged on both ledgers for one user action",
                        path.uri())
                .isEqualTo(path.doubleCharges());
    }

    /**
     * The self-hosted classifier keys off the raw URI, so a deployment context path must not change
     * the answer - otherwise the exposure would differ between a root and a sub-path install.
     */
    @ParameterizedTest(name = "{0}")
    @MethodSource("aiPaths")
    void aContextPathDoesNotChangeTheExposure(AiPath path) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/stirling" + path.uri());
        request.setRequestURI("/stirling" + path.uri());
        request.setContextPath("/stirling");

        assertThat(BillableOperationClassifier.categorize(request, false) == BillingCategory.AI)
                .as("self-hosted meter, behind a context path")
                .isEqualTo(path.doubleCharges());
    }
}
