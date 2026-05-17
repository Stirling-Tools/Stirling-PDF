package stirling.software.saas.interceptor;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.CreditConsumptionResult;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.ErrorTrackingService;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.AuthenticationUtils;
import stirling.software.saas.util.CreditHeaderUtils;

@RestControllerAdvice
@Profile("saas")
@Slf4j
@Order(1) // High priority to catch exceptions before other advice
public class CreditErrorAdvice {

    private static final String ATTR_ELIGIBLE = "CREDIT_ELIGIBLE";
    private static final String ATTR_APIKEY = "CREDIT_API_KEY";
    private static final String ATTR_CHARGED = "CREDIT_CHARGED";
    private static final String ATTR_RESOURCE_WEIGHT = "CREDIT_RESOURCE_WEIGHT";

    private final CreditService creditService;
    private final TeamCreditService teamCreditService;
    private final UserRepository userRepository;
    private final ErrorTrackingService errorTrackingService;
    private final SaasTeamExtensionService saasTeamExtensionService;
    private final CreditHeaderUtils creditHeaderUtils;
    private final Counter creditsConsumedCounter;
    // Inlined: Stirling's parent build uses Jackson 3 (tools.jackson), no Jackson 2 ObjectMapper
    // bean in the context. Stateless usage, so a fresh instance is fine.
    private final ObjectMapper objectMapper = new ObjectMapper();

    public CreditErrorAdvice(
            CreditService creditService,
            TeamCreditService teamCreditService,
            UserRepository userRepository,
            ErrorTrackingService errorTrackingService,
            SaasTeamExtensionService saasTeamExtensionService,
            CreditHeaderUtils creditHeaderUtils,
            MeterRegistry meterRegistry) {
        this.creditService = creditService;
        this.teamCreditService = teamCreditService;
        this.userRepository = userRepository;
        this.errorTrackingService = errorTrackingService;
        this.saasTeamExtensionService = saasTeamExtensionService;
        this.creditHeaderUtils = creditHeaderUtils;
        this.creditsConsumedCounter =
                Counter.builder("credits.consumed")
                        .description("Number of credits actually consumed")
                        .tag("source", "error")
                        .register(meterRegistry);
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<Object> handleThrowable(HttpServletRequest request, Throwable ex) {
        HttpStatus status = determineHttpStatus(ex);
        log.debug(
                "[CREDIT-DEBUG] CreditErrorAdvice: Handling exception: {} -> {}",
                ex.getClass().getSimpleName(),
                status);

        String message = Optional.ofNullable(ex.getMessage()).orElse("An error occurred");
        // Build error body
        Map<String, Object> body = new HashMap<>();
        body.put("error", ex.getClass().getSimpleName());
        body.put("message", message);
        body.put("status", status.value());

        var builder = ResponseEntity.status(status);

        // Handle credit consumption for errors
        if (Boolean.TRUE.equals(request.getAttribute(ATTR_ELIGIBLE))
                && request.getAttribute(ATTR_CHARGED) == null) {

            var apiKey = (String) request.getAttribute(ATTR_APIKEY);
            var resourceWeight = (Integer) request.getAttribute(ATTR_RESOURCE_WEIGHT);
            var isApiRequest = (Boolean) request.getAttribute("IS_API_REQUEST");
            int creditAmount = resourceWeight != null ? resourceWeight : 1;

            String identifierForErrorTracking =
                    apiKey; // Keep using apiKey/username for error tracking
            if (apiKey != null
                    && errorTrackingService.recordErrorAndShouldConsumeCredit(
                            identifierForErrorTracking,
                            request.getRequestURI(),
                            ex,
                            status.value())) {

                // Get current user
                Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                User user = null;
                try {
                    user = AuthenticationUtils.getCurrentUser(auth, userRepository);
                } catch (Exception e) {
                    log.warn(
                            "[CREDIT-DEBUG] CreditErrorAdvice: Could not get user for team check: {}",
                            e.getMessage());
                }

                if (user == null) {
                    log.error(
                            "[CREDIT-DEBUG] CreditErrorAdvice: Unable to resolve user - skipping credit consumption");
                } else {
                    // Check if user is in a non-personal team (must match UnifiedCreditInterceptor
                    // logic)
                    Long targetTeamId = null;
                    if (user.getTeam() != null
                            && !saasTeamExtensionService.isPersonal(user.getTeam())) {
                        targetTeamId = user.getTeam().getId();
                    }

                    boolean consumed = false;
                    String creditSource = null;

                    if (targetTeamId != null) {
                        // User is in a non-personal team - consume from team credit pool
                        consumed = teamCreditService.consumeCredit(targetTeamId, creditAmount);
                        creditSource = "TEAM_CREDITS";
                        log.debug(
                                "[CREDIT-DEBUG] CreditErrorAdvice: Consumed {} credits from team {}",
                                creditAmount,
                                targetTeamId);
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
                                    "[CREDIT-DEBUG] CreditErrorAdvice: Credit consumption failed for user: {} - {}",
                                    user.getUsername(),
                                    result.getMessage());
                        }
                    }

                    if (consumed) {
                        request.setAttribute(ATTR_CHARGED, Boolean.TRUE);
                        creditsConsumedCounter.increment();

                        // Set remaining credits header
                        int remainingCredits =
                                creditHeaderUtils.getRemainingCredits(
                                        user, creditService, teamCreditService);
                        if (remainingCredits >= 0) {
                            builder.header(
                                    "X-Credits-Remaining", Integer.toString(remainingCredits));
                            log.warn(
                                    "[CREDIT-HEADER] Added X-Credits-Remaining header: {}",
                                    remainingCredits);
                        }
                        if (creditSource != null) {
                            builder.header("X-Credit-Source", creditSource);
                        }

                        log.info(
                                "[CREDIT-DEBUG] CreditErrorAdvice: {} credits consumed from {} for user: {} (error case)",
                                creditAmount,
                                creditSource,
                                user.getUsername());
                    }
                }
            } else {
                log.debug(
                        "[CREDIT-DEBUG] CreditErrorAdvice: ErrorTrackingService says do NOT consume credit for this error");
            }
        } else if (request.getAttribute(ATTR_CHARGED) != null) {
            // Already charged, set header if user is authenticated
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated()) {
                try {
                    User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
                    int remainingCredits =
                            creditHeaderUtils.getRemainingCredits(
                                    user, creditService, teamCreditService);
                    if (remainingCredits >= 0) {
                        builder.header("X-Credits-Remaining", Integer.toString(remainingCredits));
                        log.warn(
                                "[CREDIT-HEADER] Added X-Credits-Remaining header: {}",
                                remainingCredits);
                    }
                } catch (Exception e) {
                    log.debug(
                            "[CREDIT-HEADER] Could not add credits header for already charged error: {}",
                            e.getMessage());
                }
            }
            log.debug("[CREDIT-DEBUG] CreditErrorAdvice: Header set for already charged error");
        }

        if (isSseRequest(request)) {
            String payload = toJsonPayload(body);
            String sseBody = "event: error\ndata: " + payload + "\n\n";
            return builder.contentType(MediaType.TEXT_EVENT_STREAM).body(sseBody);
        }

        return builder.body(body);
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "***" + apiKey.substring(apiKey.length() - 4);
    }

    private HttpStatus determineHttpStatus(Throwable throwable) {
        // Map common exceptions to HTTP status codes
        String exceptionClass = throwable.getClass().getSimpleName();
        switch (exceptionClass) {
            case "IllegalArgumentException":
            case "ValidationException":
            case "MethodArgumentNotValidException":
                return HttpStatus.BAD_REQUEST;
            case "AccessDeniedException":
                return HttpStatus.FORBIDDEN;
            case "UsernameNotFoundException":
                return HttpStatus.UNAUTHORIZED;
            case "HttpMessageNotReadableException":
                return HttpStatus.BAD_REQUEST;
            case "MaxUploadSizeExceededException":
                return HttpStatus.PAYLOAD_TOO_LARGE;
            case "UnsupportedOperationException":
                return HttpStatus.NOT_IMPLEMENTED;
            default:
                // Check error message for clues
                String message = throwable.getMessage();
                if (message != null) {
                    if (message.toLowerCase().contains("validation")
                            || message.toLowerCase().contains("invalid parameter")) {
                        return HttpStatus.BAD_REQUEST;
                    }
                    if (message.toLowerCase().contains("not found")) {
                        return HttpStatus.NOT_FOUND;
                    }
                }
                return HttpStatus.INTERNAL_SERVER_ERROR;
        }
    }

    private boolean isSseRequest(HttpServletRequest request) {
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
            return true;
        }
        String contentType = request.getContentType();
        return contentType != null && contentType.contains(MediaType.TEXT_EVENT_STREAM_VALUE);
    }

    private String toJsonPayload(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exc) {
            log.warn("Failed to serialize SSE error payload, falling back to string", exc);
            String message = payload.getOrDefault("message", "An error occurred").toString();
            return "{\"error\":\"Error\",\"message\":\"" + message + "\",\"status\":500}";
        }
    }

    public static class ErrorResponse {
        public final String error;
        public final String message;
        public final int status;

        public ErrorResponse(String error, String message, int status) {
            this.error = error;
            this.message = message;
            this.status = status;
        }
    }
}
