package stirling.software.saas.interceptor;

import org.springframework.context.annotation.Profile;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.AuthenticationUtils;
import stirling.software.saas.util.CreditHeaderUtils;

// Legacy credit-billing success advice. PAYG writes its own ledger entries via
// JobChargeService — disabled by default in saas, activate legacy-credits profile if needed.
@RestControllerAdvice
@Profile("saas & legacy-credits")
@Slf4j
public class CreditSuccessAdvice implements ResponseBodyAdvice<Object> {

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

    @Override
    public boolean supports(
            MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        // Only REST bodies; this covers @ResponseBody and ResponseEntity
        return true;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType selectedContentType,
            Class<? extends HttpMessageConverter<?>> selectedConverterType,
            ServerHttpRequest request,
            ServerHttpResponse response) {

        if (!(request instanceof ServletServerHttpRequest)) {
            return body;
        }

        var servletReq = ((ServletServerHttpRequest) request).getServletRequest();
        if (!Boolean.TRUE.equals(servletReq.getAttribute(ATTR_ELIGIBLE))) {
            return body;
        }

        if (servletReq.getAttribute(ATTR_CHARGED) != null) {
            return body;
        }

        // If the handler returned an error ResponseEntity (>=400) without throwing,
        // don't spend here; the error advice will decide.
        int status = 200;
        if (response instanceof ServletServerHttpResponse) {
            status = ((ServletServerHttpResponse) response).getServletResponse().getStatus();
        }
        if (status >= 400) {
            log.debug(
                    "[CREDIT-DEBUG] CreditSuccessAdvice: Error status {} detected, skipping credit consumption",
                    status);
            return body;
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
                return body;
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
                    response.getHeaders()
                            .set("X-Credits-Remaining", Integer.toString(remainingCredits));
                    log.warn(
                            "[CREDIT-HEADER] Added X-Credits-Remaining header: {}",
                            remainingCredits);
                }
                if (creditSource != null) {
                    response.getHeaders().set("X-Credit-Source", creditSource);
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

        return body;
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "***" + apiKey.substring(apiKey.length() - 4);
    }
}
