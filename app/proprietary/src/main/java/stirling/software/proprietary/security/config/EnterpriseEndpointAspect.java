package stirling.software.proprietary.security.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.LicenseServiceInterface;

/**
 * Refuses {@code @EnterpriseEndpoint} work below Enterprise.
 *
 * <p>Asks per request for the same reason as {@link PremiumEndpointAspect}: the {@code runningEE}
 * bean is a value copied once at startup, so a snapshot keeps refusing a licence entered after boot
 * until someone restarts. It cuts both ways - a lapsed or revoked licence, or one the weekly
 * recheck cannot confirm, now closes the gate on the next request rather than at the next restart.
 */
@Aspect
@Component
public class EnterpriseEndpointAspect {

    private final LicenseServiceInterface licenseService;

    public EnterpriseEndpointAspect(LicenseServiceInterface licenseService) {
        this.licenseService = licenseService;
    }

    @Around(
            "@annotation(stirling.software.proprietary.security.config.EnterpriseEndpoint) || @within(stirling.software.proprietary.security.config.EnterpriseEndpoint)")
    public Object checkEnterpriseAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!licenseService.isRunningEE()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This endpoint requires an Enterprise license");
        }
        return joinPoint.proceed();
    }
}
