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
 * MIGRATION (Spring AOP -> CDI interceptor): was an {@code @Aspect} {@code @Component} with
 * {@code @Around} advice matching {@code @annotation(EnterpriseEndpoint)} /
 * {@code @within(EnterpriseEndpoint)}. Reworked into a CDI {@link Interceptor} bound by the
 * {@code @EnterpriseEndpoint} annotation (pattern: common/aop/AutoJobAspect). {@code @Around} +
 * {@code ProceedingJoinPoint} became {@code @AroundInvoke} + {@link InvocationContext};
 * {@code joinPoint.proceed()} -> {@code ctx.proceed()}. The Spring
 * {@code ResponseStatusException(HttpStatus.FORBIDDEN, ...)} became a JAX-RS
 * {@link WebApplicationException} with {@link Response.Status#FORBIDDEN}. The
 * {@code @Qualifier("runningEE")} ctor param became {@code @Inject @Named("runningEE")}.
 *
 * <p>TODO: Migration required - for this CDI interceptor to fire, the collaborator annotation
 * {@code stirling.software.proprietary.security.config.EnterpriseEndpoint} must be made a CDI
 * {@code @jakarta.interceptor.InterceptorBinding} (it is currently a plain runtime annotation), and
 * the interceptor must be enabled (Quarkus enables {@code @Interceptor} beans automatically once the
 * binding is an {@code @InterceptorBinding}; no beans.xml ordering change needed). It already
 * targets METHOD and TYPE, matching the original {@code @annotation}/{@code @within} pointcut.
 */
@Interceptor
@EnterpriseEndpoint
@Priority(Interceptor.Priority.APPLICATION)
public class EnterpriseEndpointAspect {

    private final boolean runningEE;

    @Inject
    public EnterpriseEndpointAspect(@Named("runningEE") boolean runningEE) {
        this.runningEE = runningEE;
    }

    @AroundInvoke
    public Object checkEnterpriseAccess(InvocationContext ctx) throws Exception {
        if (!runningEE) {
            throw new WebApplicationException(
                    "This endpoint requires an Enterprise license", Response.Status.FORBIDDEN);
        }
        return ctx.proceed();
    }
}
