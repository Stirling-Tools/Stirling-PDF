package stirling.software.common.annotations;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Matches unless {@code processor.enabled=false}, which yields an editor-only deployment. Absent
 * the property the Processor is on, so existing installs are unaffected.
 *
 * <p>Applied to the Processor's controllers and its background/boot-work beans. Types that
 * non-Processor code injects (stores, services, JPA entities, repositories) stay ungated so the
 * context still starts with the Processor off.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@ConditionalOnProperty(name = "processor.enabled", havingValue = "true", matchIfMissing = true)
public @interface ConditionalOnProcessor {}
