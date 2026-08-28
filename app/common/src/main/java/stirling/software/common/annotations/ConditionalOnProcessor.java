package stirling.software.common.annotations;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.context.annotation.Conditional;

import stirling.software.common.configuration.ProcessorFeature;

/**
 * Matches while {@link ProcessorFeature#ENABLED} is true. Applied to the Processor's controllers
 * and its background/boot-work beans; types that non-Processor code injects (stores, services, JPA
 * entities, repositories) stay ungated so the context still starts with the Processor off.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Conditional(ProcessorFeature.class)
public @interface ConditionalOnProcessor {}
