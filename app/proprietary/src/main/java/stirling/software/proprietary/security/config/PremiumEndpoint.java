package stirling.software.proprietary.security.config;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.interceptor.InterceptorBinding;

/**
 * Annotation to mark endpoints that require a Pro or higher license.
 *
 * <p>Migration: this is the CDI {@link InterceptorBinding} for {@code PremiumEndpointAspect} (was a
 * Spring AOP pointcut on {@code @annotation}/{@code @within}). The binding makes Quarkus Arc enable
 * the {@code @Interceptor} bean and apply it to any method or type carrying this annotation.
 */
@InterceptorBinding
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface PremiumEndpoint {}
