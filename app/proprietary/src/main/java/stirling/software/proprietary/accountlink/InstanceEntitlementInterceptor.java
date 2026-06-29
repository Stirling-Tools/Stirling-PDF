package stirling.software.proprietary.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Request-time gate for combined-billing "Mode A". Runs before billable (AI / automation) work and
 * blocks it when the instance is unlinked or over its limit; manual tools pass straight through.
 *
 * <p>Blocking responds {@code 402 Payment Required} with a small machine-readable body — {@code
 * {"error":"ACCOUNT_LINK_REQUIRED","reason":"NOT_LINKED"}} — that the FE maps to a "link to
 * activate" prompt (the same DownstreamEntitlementError-style envelope already used for saas limit
 * responses). Fail-open and flag-off both let the request continue.
 *
 * <p>Gated + {@code @Profile("!saas")}; when the flag is off the bean is absent and the {@link
 * AccountLinkWebMvcConfig} never registers it, so there is no per-request cost.
 */
@Slf4j
@Component
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceEntitlementInterceptor implements HandlerInterceptor {

    private final InstanceEntitlementGate gate;

    public InstanceEntitlementInterceptor(InstanceEntitlementGate gate) {
        this.gate = gate;
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        GateDecision decision;
        try {
            decision = gate.evaluate(BillableOperationClassifier.isBillable(request));
        } catch (RuntimeException e) {
            // Fail open: an inability to resolve entitlement (e.g. a DB or SaaS blip) must never
            // turn into a hard block on billable work.
            log.debug("Account-link gate evaluation failed; allowing request", e);
            return true;
        }
        if (decision.allowed()) {
            return true;
        }

        log.debug("Account-link gate blocked {} ({})", request.getRequestURI(), decision.reason());
        response.setStatus(HttpStatus.PAYMENT_REQUIRED.value());
        response.setContentType("application/json");
        response.getWriter()
                .write(
                        "{\"error\":\"ACCOUNT_LINK_REQUIRED\",\"reason\":\""
                                + decision.reason().name()
                                + "\"}");
        return false;
    }
}
