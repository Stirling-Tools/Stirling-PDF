package stirling.software.proprietary.cluster.valkey;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;

/**
 * Both checks are required: enabled alone may still select the in-process backplane, which must not
 * load Valkey beans.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@ConditionalOnExpression(
        "${cluster.enabled:false} and '${cluster.backplane:inprocess}'.equals('valkey')")
public @interface ConditionalOnValkeyBackplane {}
