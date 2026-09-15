package stirling.software.proprietary.security.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.LicenseServiceInterface;

@Aspect
@Component
public class PremiumEndpointAspect {

    private final boolean runningProOrHigher;

    private final LicenseServiceInterface licenseService;

    public PremiumEndpointAspect(
            @Qualifier("runningProOrHigher") boolean runningProOrHigher,
            @Autowired(required = false) LicenseServiceInterface licenseService) {
        this.runningProOrHigher = runningProOrHigher;
        this.licenseService = licenseService;
    }

    @Around(
            "@annotation(stirling.software.proprietary.security.config.PremiumEndpoint) || @within(stirling.software.proprietary.security.config.PremiumEndpoint)")
    public Object checkPremiumAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!isProOrHigher()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This endpoint requires a Server or Enterprise license");
        }
        return joinPoint.proceed();
    }

    private boolean isProOrHigher() {
        return runningProOrHigher
                || (licenseService != null && licenseService.isRunningProOrHigher());
    }
}
