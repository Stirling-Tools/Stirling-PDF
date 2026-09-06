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
public class EnterpriseEndpointAspect {

    private final boolean runningEE;

    private final LicenseServiceInterface licenseService;

    public EnterpriseEndpointAspect(
            @Qualifier("runningEE") boolean runningEE,
            @Autowired(required = false) LicenseServiceInterface licenseService) {
        this.runningEE = runningEE;
        this.licenseService = licenseService;
    }

    @Around(
            "@annotation(stirling.software.proprietary.security.config.EnterpriseEndpoint) || @within(stirling.software.proprietary.security.config.EnterpriseEndpoint)")
    public Object checkEnterpriseAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!isEnterprise()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This endpoint requires an Enterprise license");
        }
        return joinPoint.proceed();
    }

    private boolean isEnterprise() {
        return runningEE || (licenseService != null && licenseService.isRunningEE());
    }
}
