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
 *
 * <p>TODO: Migration required - the {@code @PremiumEndpoint} annotation (collaborator file
 * stirling.software.proprietary.security.config.PremiumEndpoint) must be annotated with
 * {@code @jakarta.interceptor.InterceptorBinding} (and target METHOD + TYPE, retention RUNTIME) for
 * this CDI interceptor to bind. Both method-level ({@code @annotation}) and type-level
 * ({@code @within}) placement are already supported by CDI when the binding targets METHOD/TYPE.
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
