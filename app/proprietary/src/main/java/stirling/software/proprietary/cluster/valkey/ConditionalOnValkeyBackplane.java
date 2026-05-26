package stirling.software.proprietary.cluster.valkey;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;

/**
 * Composite condition: cluster mode is on AND the configured backplane is Valkey.
 *
 * <p>Either condition alone is insufficient to load a Valkey bean. With {@code enabled=true} but
 * {@code backplane=inprocess}, loading the Valkey beans would crash at boot because there's no
 * {@code StringRedisTemplate}; with {@code enabled=false} the whole cluster mode is off. Combining
 * the two stops both footguns.
 *
 * <p>Spring's {@code @ConditionalOnProperty} cannot be applied twice on the same class, so we use
 * {@code @ConditionalOnExpression} via this meta-annotation.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@ConditionalOnExpression(
        "${cluster.enabled:false} and '${cluster.backplane:inprocess}'.equals('valkey')")
public @interface ConditionalOnValkeyBackplane {}
