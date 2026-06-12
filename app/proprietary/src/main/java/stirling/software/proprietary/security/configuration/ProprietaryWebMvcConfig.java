package stirling.software.proprietary.security.configuration;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.filter.ParticipantRateLimitInterceptor;

/**
 * TODO: Migration required - Spring MVC's WebMvcConfigurer / InterceptorRegistry has no Quarkus
 * (JAX-RS / RESTEasy Reactive) equivalent, so this registration class cannot be ported directly.
 *
 * <p>This class only existed to bind {@link ParticipantRateLimitInterceptor} to the path pattern
 * "/api/v1/workflow/participant/**". In Quarkus the rate-limiting logic should instead live in a
 * {@code jakarta.ws.rs.container.ContainerRequestFilter} annotated with {@code @Provider} (and
 * scoped to the participant endpoints via a {@code @NameBinding} annotation or by inspecting
 * {@code UriInfo.getPath()} inside the filter). Once {@link ParticipantRateLimitInterceptor} is
 * converted to such a filter, the registration is automatic (Quarkus discovers @Provider filters)
 * and this class can be deleted entirely.
 *
 * <p>Kept as an @ApplicationScoped bean (with no behavior) so the build still discovers the type;
 * the collaborator file {@link ParticipantRateLimitInterceptor} must be migrated to complete this.
 */
@ApplicationScoped
@RequiredArgsConstructor
public class ProprietaryWebMvcConfig {

    private final ParticipantRateLimitInterceptor participantRateLimitInterceptor;

    // TODO: Migration required - the interceptor registration below was removed:
    //   registry.addInterceptor(participantRateLimitInterceptor)
    //           .addPathPatterns("/api/v1/workflow/participant/**");
    // Re-implement as a JAX-RS ContainerRequestFilter bound to that path (see class javadoc).
}
