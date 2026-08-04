package stirling.software.proprietary.security.config;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

/**
 * MIGRATION (Spring AOP -> CDI interceptor): was an {@code @Aspect} with {@code @Around} advice on
 * the {@code @PremiumEndpoint} pointcut ({@code @annotation || @within}). Reworked into a CDI
 * {@link Interceptor} bound by the {@code @PremiumEndpoint} {@code @InterceptorBinding};
 * {@code @Around}/{@code ProceedingJoinPoint} became {@code @AroundInvoke}/{@link
 * InvocationContext}. The Spring {@code ResponseStatusException(HttpStatus.FORBIDDEN, ...)} became
 * a JAX-RS {@link WebApplicationException} with {@link Response.Status#FORBIDDEN}.
 */
@Interceptor
@PremiumEndpoint
@Priority(Interceptor.Priority.APPLICATION)
public class PremiumEndpointAspect {

    private final boolean runningProOrHigher;

    @Inject
    public PremiumEndpointAspect(@Named("runningProOrHigher") boolean runningProOrHigher) {
        this.runningProOrHigher = runningProOrHigher;
    }

    @AroundInvoke
    public Object checkPremiumAccess(InvocationContext ctx) throws Exception {
        if (!runningProOrHigher) {
            throw new WebApplicationException(
                    "This endpoint requires a Server or Enterprise license",
                    Response.Status.FORBIDDEN);
        }
        return ctx.proceed();
    }
}
