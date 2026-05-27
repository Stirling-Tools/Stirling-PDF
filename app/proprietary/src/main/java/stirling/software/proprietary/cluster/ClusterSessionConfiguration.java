package stirling.software.proprietary.cluster;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.session.data.redis.config.annotation.web.http.EnableRedisHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

/**
 * Enables Spring Session backed by Valkey when cluster mode is on AND a Lettuce connection factory
 * exists (backplane=valkey). {@link ConditionalOnBean} prevents {@code @EnableRedisHttpSession}
 * from wiring its filter before the required connection factory is present; without it the bean
 * graph fails with "No qualifying bean of type 'SessionRepository'".
 */
@Configuration
@ConditionalOnProperty(name = "cluster.enabled", havingValue = "true")
@ConditionalOnBean(LettuceConnectionFactory.class)
@EnableRedisHttpSession
public class ClusterSessionConfiguration {

    /**
     * The bean name {@code springSessionDefaultRedisSerializer} is the exact hook Spring Session
     * uses to override JDK serialization. JDK serialization is a deserialization-gadget RCE surface
     * for anyone with Valkey write access; Jackson JSON is not.
     *
     * <p>Migrate to {@code GenericJacksonJsonRedisSerializer} when the Spring Session reference doc
     * does (https://docs.spring.io/spring-session/reference/spring-security.html#config-redis).
     */
    @Bean
    @SuppressWarnings(
            "removal") // GenericJackson2JsonRedisSerializer is the documented recipe name; migrate
    // when upstream does
    public RedisSerializer<Object> springSessionDefaultRedisSerializer() {
        return new GenericJackson2JsonRedisSerializer();
    }

    /**
     * Harden the Spring Session cookie: Spring Session omits {@code Secure} and {@code SameSite} by
     * default, leaving the session id susceptible to plaintext leakage and CSRF. {@code Lax} allows
     * top-level navigations (login redirects) while blocking cross-site sub-resource requests.
     * HttpOnly is on by default - asserted in the regression test.
     */
    @Bean
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setUseSecureCookie(true);
        serializer.setSameSite("Lax");
        return serializer;
    }
}
