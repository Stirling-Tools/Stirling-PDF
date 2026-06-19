package stirling.software.proprietary.security.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.interceptor.InterceptorBinding;

/**
 * Marks a JAX-RS endpoint (or whole resource) as forbidden for demo accounts. The Quarkus
 * replacement for Spring's {@code @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")}: that negated
 * authority cannot be expressed with {@code @RolesAllowed}, so it is enforced at runtime by {@link
 * DenyDemoUserInterceptor} against the current {@code SecurityIdentity}. Authenticated non-demo
 * users and anonymous callers pass through; only an identity holding the {@code DEMO_USER} role is
 * rejected with 403.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@InterceptorBinding
public @interface DenyDemoUser {}
