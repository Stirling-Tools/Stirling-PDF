package stirling.software.proprietary.security.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.LicenseServiceInterface;

/**
 * Refuses {@code @PremiumEndpoint} work below Server.
 *
 * <p>Asks per request rather than holding the {@code runningProOrHigher} bean, which is a value
 * copied once at startup. The tier is not fixed for the life of the process: an admin can enter a
 * licence key, the scheduled recheck can find one lapsed, and a linked instance can have a Team
 * plan bought or cancelled under it. A snapshot grants a cancelled plan until someone restarts, and
 * the customer who stopped paying has no reason to.
 */
@Aspect
@Component
public class PremiumEndpointAspect {

    private final LicenseServiceInterface licenseService;

    public PremiumEndpointAspect(LicenseServiceInterface licenseService) {
        this.licenseService = licenseService;
    }

    @Around(
            "@annotation(stirling.software.proprietary.security.config.PremiumEndpoint) || @within(stirling.software.proprietary.security.config.PremiumEndpoint)")
    public Object checkPremiumAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!licenseService.isRunningProOrHigher()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This endpoint requires a Server or Enterprise license");
        }
        return joinPoint.proceed();
    }
}
