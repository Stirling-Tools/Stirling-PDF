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
public class PremiumEndpointAspect {

    private final boolean runningProOrHigher;

    public PremiumEndpointAspect(@Qualifier("runningProOrHigher") boolean runningProOrHigher) {
        this.runningProOrHigher = runningProOrHigher;
    }

    @Around(
            "@annotation(stirling.software.proprietary.security.config.PremiumEndpoint) || @within(stirling.software.proprietary.security.config.PremiumEndpoint)")
    public Object checkPremiumAccess(ProceedingJoinPoint joinPoint) throws Throwable {
        if (!runningProOrHigher) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This endpoint requires a Pro or higher license");
        }
        return joinPoint.proceed();
    }
}
