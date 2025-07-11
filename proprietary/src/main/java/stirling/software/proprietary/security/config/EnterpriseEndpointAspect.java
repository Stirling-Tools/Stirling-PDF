package stirling.software.proprietary.security.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Aspect
@Component
public class EnterpriseEndpointAspect {

    private final boolean runningEE;

    public EnterpriseEndpointAspect(@Qualifier("runningEE") boolean runningEE) {
        this.runningEE = runningEE;
    }

    @Around(
            "@annotation(stirling.software.proprietary.security.config.EnterpriseEndpoint) || @within(stirling.software.proprietary.security.config.EnterpriseEndpoint)")
    public Object checkEnterpriseAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!runningEE) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This endpoint requires an Enterprise license");
        }
        return joinPoint.proceed();
    }
}
