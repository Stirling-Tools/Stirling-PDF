package stirling.software.SPDF.config;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.context.annotation.Conditional;

/**
 * Annotation to conditionally enable components based on the availability of UnoServer. Components
 * annotated with this will only be created if UnoServer is available on the system.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Conditional(UnoServerAvailableCondition.class)
public @interface ConditionalOnUnoServerAvailable {}
