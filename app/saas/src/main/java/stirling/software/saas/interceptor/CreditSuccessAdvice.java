package stirling.software.saas.interceptor;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.AuthenticationUtils;
import stirling.software.saas.util.CreditHeaderUtils;

/**
 * Consumes credits on the success path and sets the remaining-credits response headers.
 *
 * <p>// TODO: Migration required - was a Spring {@code @RestControllerAdvice} ({@code @Profile(
 * "saas")}) implementing {@code ResponseBodyAdvice<Object>} with {@code supports(...)} and {@code
 * beforeBodyWrite(...)}. Spring's {@code ResponseBodyAdvice}, {@code MethodParameter}, {@code
 * HttpMessageConverter}, {@code ServerHttpRequest/Response} and {@code
 * ServletServerHttpRequest/Response} have no Quarkus equivalent. Re-express the body-write
 * interception as a JAX-RS {@code @jakarta.ws.rs.ext.Provider ContainerResponseFilter}. The
 * original {@code supports(...)} returned true for all REST bodies. The credit-consumption logic
 * from {@code beforeBodyWrite} is preserved verbatim in {@link
 * #onBeforeBodyWrite(HttpServletRequest, HttpServletResponse)} below, operating on the servlet
 * request/response that the original obtained via {@code
 * ServletServerHttpRequest.getServletRequest()} / {@code
 * ServletServerHttpResponse.getServletResponse()}.
 */
@ApplicationScoped
@Slf4j
public class CreditSuccessAdvice {

    private static final String ATTR_ELIGIBLE = "CREDIT_ELIGIBLE";
    private static final String ATTR_APIKEY = "CREDIT_API_KEY";
    private static final String ATTR_CHARGED = "CREDIT_CHARGED";
    private static final String ATTR_RESOURCE_WEIGHT = "CREDIT_RESOURCE_WEIGHT";

    private final CreditService creditService;
    private final TeamCreditService teamCreditService;
    private final UserRepository userRepository;
    private final SaasTeamExtensionService saasTeamExtensionService;
    private final CreditHeaderUtils creditHeaderUtils;
    private final Counter creditsConsumedCounter;

    public CreditSuccessAdvice(
            CreditService creditService,
            TeamCreditService teamCreditService,
            UserRepository userRepository,
            SaasTeamExtensionService saasTeamExtensionService,
            CreditHeaderUtils creditHeaderUtils,
            MeterRegistry meterRegistry) {
        this.creditService = creditService;
        this.teamCreditService = teamCreditService;
        this.userRepository = userRepository;
        this.saasTeamExtensionService = saasTeamExtensionService;
        this.creditHeaderUtils = creditHeaderUtils;
        this.creditsConsumedCounter =
                Counter.builder("credits.consumed")
                        .description("Number of credits actually consumed")
                        .tag("source", "success")
                        .register(meterRegistry);
    }

    // TODO: Migration required - was ResponseBodyAdvice#beforeBodyWrite(Object body,
    // MethodParameter,
    // MediaType, Class<? extends HttpMessageConverter<?>>, ServerHttpRequest, ServerHttpResponse).
    // Re-wire as ContainerResponseFilter.filter(ContainerRequestContext, ContainerResponseContext).
    // The original returned `body` unchanged; this side-effects credit consumption + response
    // headers, so the response transformation is unnecessary - only the header mutation matters.
    public void onBeforeBodyWrite(HttpServletRequest servletReq, HttpServletResponse response) {

        if (!Boolean.TRUE.equals(servletReq.getAttribute(ATTR_ELIGIBLE))) {
            return;
        }

        if (servletReq.getAttribute(ATTR_CHARGED) != null) {
            return;
        }

        // If the handler returned an error response (>=400) without throwing,
        // don't spend here; the error advice will decide.
        int status = response.getStatus();
        if (status >= 400) {
            log.debug(
                    "[CREDIT-DEBUG] CreditSuccessAdvice: Error status {} detected, skipping credit consumption",
                    status);
            return;
        }

        var apiKey = (String) servletReq.getAttribute(ATTR_APIKEY);
        var resourceWeight = (Integer) servletReq.getAttribute(ATTR_RESOURCE_WEIGHT);
        var isApiRequest = (Boolean) servletReq.getAttribute("IS_API_REQUEST");
        int creditAmount = resourceWeight != null ? resourceWeight : 1;

        if (apiKey != null) {
            // Get current user
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            User user = null;
            try {
                user = AuthenticationUtils.getCurrentUser(auth, userRepository);
            } catch (Exception e) {
                log.warn(
                        "[CREDIT-DEBUG] CreditSuccessAdvice: Could not get user for team check: {}",
                        e.getMessage());
            }

            if (user == null) {
                log.error(
                        "[CREDIT-DEBUG] CreditSuccessAdvice: Unable to resolve user - skipping credit consumption");
                return;
            }

            // Check if user is in a non-personal team (must match UnifiedCreditInterceptor logic)
            // IMPORTANT: Limited API users (anonymous, extra limited) always use personal credits,
            // never team credits
            boolean isLimitedApiUser =
                    auth.getAuthorities().stream()
                            .anyMatch(
                                    authority ->
                                            "ROLE_LIMITED_API_USER".equals(authority.getAuthority())
                                                    || "ROLE_EXTRA_LIMITED_API_USER"
                                                            .equals(authority.getAuthority()));
            Long targetTeamId = null;
            if (!isLimitedApiUser
                    && user.getTeam() != null
                    && !saasTeamExtensionService.isPersonal(user.getTeam())) {
                targetTeamId = user.getTeam().getId();
            }

            final boolean consumed;
            final String creditSource;

            if (targetTeamId != null) {
                // User is in a non-personal team - use waterfall with leader overage
                CreditConsumptionResult result =
                        teamCreditService.consumeCreditWithWaterfall(targetTeamId, creditAmount);
                consumed = result.isSuccess();
                creditSource = result.getSource();

                if (!consumed) {
                    log.error(
                            "[CREDIT-DEBUG] CreditSuccessAdvice: Team credit consumption failed:"
                                    + " {}",
                            result.getMessage());
                } else {
                    log.debug(
                            "[CREDIT-DEBUG] CreditSuccessAdvice: Consumed {} credits from team {}"
                                    + " via {}",
                            creditAmount,
                            targetTeamId,
                            creditSource);
                }
            } else {
                // No team - use waterfall logic for individual credits
                boolean isApiRequestFlag = Boolean.TRUE.equals(isApiRequest);
                CreditConsumptionResult result =
                        creditService.consumeCreditWithWaterfall(
                                user, creditAmount, isApiRequestFlag);
                consumed = result.isSuccess();
                creditSource = result.getSource();

                if (!consumed) {
                    log.error(
                            "[CREDIT-DEBUG] CreditSuccessAdvice: Credit consumption failed for user: {} - {}",
                            user.getUsername(),
                            result.getMessage());
                }
            }

            if (consumed) {
                servletReq.setAttribute(ATTR_CHARGED, Boolean.TRUE);
                creditsConsumedCounter.increment();

                // Set remaining credits header
                int remainingCredits =
                        creditHeaderUtils.getRemainingCredits(
                                user, creditService, teamCreditService);
                if (remainingCredits >= 0) {
                    response.setHeader("X-Credits-Remaining", Integer.toString(remainingCredits));
                    log.warn(
                            "[CREDIT-HEADER] Added X-Credits-Remaining header: {}",
                            remainingCredits);
                }
                if (creditSource != null) {
                    response.setHeader("X-Credit-Source", creditSource);
                }

                log.info(
                        "[CREDIT-DEBUG] CreditSuccessAdvice: {} credits consumed from {} for user: {}",
                        creditAmount,
                        creditSource,
                        user.getUsername());
            }
        } else {
            log.warn("[CREDIT-DEBUG] CreditSuccessAdvice: No apiKey attribute found");
        }
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "***" + apiKey.substring(apiKey.length() - 4);
    }
}
