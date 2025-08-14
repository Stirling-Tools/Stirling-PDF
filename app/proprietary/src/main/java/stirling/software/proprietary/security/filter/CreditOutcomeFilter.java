package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.CreditRequestContext;
import stirling.software.proprietary.model.FailureType;
import stirling.software.proprietary.service.ApiCreditService;
import stirling.software.proprietary.service.CreditContextManager;

/**
 * Filter that runs after API processing to record credit outcomes based on response status and any
 * exceptions that occurred
 */
@Component
@Order(100) // Run after ApiCreditFilter (Order=1) and other processing
@RequiredArgsConstructor
@Slf4j
public class CreditOutcomeFilter extends OncePerRequestFilter {

    private final CreditContextManager contextManager;
    private final ApiCreditService creditService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Only process if we have credit context (meaning this was a credit-tracked request)
        CreditRequestContext context = contextManager.getContext();
        if (context == null || !context.isCreditsPreChecked()) {
            filterChain.doFilter(request, response);
            return;
        }

        // Set response in context for header updates later
        context.setHttpResponse(response);

        // Wrap response to capture status without buffering body
        StatusCaptureResponseWrapper responseWrapper = new StatusCaptureResponseWrapper(response);

        Exception processingException = null;
        try {
            filterChain.doFilter(request, responseWrapper);
        } catch (Exception e) {
            processingException = e;
            throw e; // Re-throw to maintain normal exception handling
        } finally {
            // Record the outcome based on response status and any exception
            recordCreditOutcome(context, responseWrapper.getStatusCode(), processingException);
        }
    }

    private void recordCreditOutcome(
            CreditRequestContext context, int httpStatus, Exception exception) {
        try {
            FailureType outcome = ApiCreditService.determineFailureType(httpStatus, exception);

            if (context.isAnonymous()) {
                // For anonymous users, just log the outcome (credits already consumed)
                creditService.recordAnonymousRequestOutcome(
                        context.getIpAddress(),
                        context.getUserAgent(),
                        context.getCreditCost(),
                        outcome);
            } else {
                // For authenticated users, this determines if/how credits are charged
                ApiCreditService.CreditStatus status = creditService.recordRequestOutcome(
                        context.getUser(), context.getCreditCost(), outcome);
                
                // Update response headers to reflect post-charge state
                if (status != null) {
                    updateCreditHeaders(context.getHttpResponse(), status, context.getCreditCost());
                }
            }

        } catch (Exception e) {
            log.error(
                    "Error recording credit outcome for request {}: {}",
                    context.getRequestId(),
                    e.getMessage(),
                    e);

            // On error recording outcome, default to charging credits to be safe
            if (!context.isAnonymous()) {
                try {
                    creditService.recordRequestOutcome(
                            context.getUser(),
                            context.getCreditCost(),
                            FailureType.PROCESSING_ERROR);
                } catch (Exception e2) {
                    log.error("Failed to record fallback credit charge: {}", e2.getMessage());
                }
            }
        }
    }

    /**
     * Lightweight response wrapper that captures HTTP status without buffering the response body.
     * This avoids memory issues with large PDF responses while still allowing us to track outcomes.
     */
    private static class StatusCaptureResponseWrapper extends HttpServletResponseWrapper {
        private int httpStatus = HttpServletResponse.SC_OK;

        public StatusCaptureResponseWrapper(HttpServletResponse response) {
            super(response);
        }

        @Override
        public void setStatus(int sc) {
            this.httpStatus = sc;
            super.setStatus(sc);
        }

        @Override
        public void sendError(int sc) throws IOException {
            this.httpStatus = sc;
            super.sendError(sc);
        }

        @Override
        public void sendError(int sc, String msg) throws IOException {
            this.httpStatus = sc;
            super.sendError(sc, msg);
        }

        public int getStatusCode() {
            return httpStatus;
        }
    }

    private void updateCreditHeaders(HttpServletResponse response, ApiCreditService.CreditStatus status, int creditCost) {
        // Calculate window length (seconds in current month)
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        YearMonth nextMonth = currentMonth.plusMonths(1);
        ZonedDateTime startOfMonth = currentMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        ZonedDateTime startOfNextMonth = nextMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        long windowSeconds = java.time.Duration.between(startOfMonth, startOfNextMonth).getSeconds();
        long resetSeconds = java.time.Duration.between(ZonedDateTime.now(ZoneOffset.UTC), startOfNextMonth).getSeconds();

        // Update headers to reflect post-charge state
        response.setHeader("RateLimit-Limit", String.valueOf(status.monthlyCredits()));
        response.setHeader("RateLimit-Remaining", String.valueOf(status.remaining()));
        response.setHeader("RateLimit-Reset", String.valueOf(resetSeconds));
        response.setHeader("RateLimit-Policy", String.format("%d;w=%d;comment=\"%s\"", status.monthlyCredits(), windowSeconds, status.scope()));
        response.setHeader("X-Credits-Used-This-Month", String.valueOf(status.creditsConsumed()));
        response.setHeader("X-Credit-Cost", String.valueOf(creditCost));
    }
}
