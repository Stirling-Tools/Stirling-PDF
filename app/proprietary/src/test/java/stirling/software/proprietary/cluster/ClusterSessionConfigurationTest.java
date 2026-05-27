package stirling.software.proprietary.cluster;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

import jakarta.servlet.http.Cookie;

/**
 * Security regression test for {@link ClusterSessionConfiguration}.
 *
 * <p>The bean name {@code springSessionDefaultRedisSerializer} is the exact override hook Spring
 * Session inspects. If it is absent, Spring Session falls back to JDK serialization on session read
 * / write, which is a deserialization-gadget RCE surface for anyone with Valkey write access.
 * Asserting both the bean's existence and its concrete type guards against accidental removal
 * during future refactors.
 */
class ClusterSessionConfigurationTest {

    @Configuration
    static class StubConnectionFactoryConfig {
        @Bean
        LettuceConnectionFactory lettuceConnectionFactory() {
            // Stub - satisfies @ConditionalOnBean without opening a real connection.
            return new LettuceConnectionFactory();
        }
    }

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            StubConnectionFactoryConfig.class, ClusterSessionConfiguration.class);

    @Test
    void clusterDisabled_configurationIsInert_noSerializerBean() {
        runner.run(
                context ->
                        assertThat(context)
                                .hasNotFailed()
                                .doesNotHaveBean("springSessionDefaultRedisSerializer"));
    }

    @Test
    @SuppressWarnings(
            "removal") // see ClusterSessionConfiguration#springSessionDefaultRedisSerializer
    void clusterEnabled_withLettuceFactory_wiresJsonSerializerUnderExpectedBeanName() {
        runner.withPropertyValues("cluster.enabled=true")
                .run(
                        context -> {
                            assertThat(context).hasNotFailed();
                            assertThat(context.containsBean("springSessionDefaultRedisSerializer"))
                                    .as("Spring Session looks up this exact bean name")
                                    .isTrue();
                            RedisSerializer<?> serializer =
                                    context.getBean(
                                            "springSessionDefaultRedisSerializer",
                                            RedisSerializer.class);
                            assertThat(serializer)
                                    .as(
                                            "must be JSON serializer; JDK serialization is a"
                                                    + " deserialization-gadget RCE surface")
                                    .isInstanceOf(GenericJackson2JsonRedisSerializer.class);
                        });
    }

    @Test
    void clusterEnabled_sessionCookie_isSecureHttpOnlyAndSameSiteLax() {
        runner.withPropertyValues("cluster.enabled=true")
                .run(
                        context -> {
                            assertThat(context).hasNotFailed();
                            assertThat(context.containsBean("cookieSerializer")).isTrue();
                            CookieSerializer serializer =
                                    context.getBean("cookieSerializer", CookieSerializer.class);
                            assertThat(serializer)
                                    .as("must be the Spring Session DefaultCookieSerializer")
                                    .isInstanceOf(DefaultCookieSerializer.class);

                            MockHttpServletRequest request = new MockHttpServletRequest();
                            request.setSecure(true);
                            MockHttpServletResponse response = new MockHttpServletResponse();
                            serializer.writeCookieValue(
                                    new CookieSerializer.CookieValue(
                                            request, response, "sess-value"));

                            Cookie cookie = response.getCookie("SESSION");
                            assertThat(cookie).as("SESSION cookie must be written").isNotNull();
                            assertThat(cookie.getSecure())
                                    .as("Secure flag MUST be set for HTTPS deployments")
                                    .isTrue();
                            assertThat(cookie.isHttpOnly())
                                    .as("HttpOnly MUST be set to block JS access")
                                    .isTrue();
                            // SameSite is not a Cookie API field; check the raw Set-Cookie header.
                            assertThat(response.getHeader("Set-Cookie"))
                                    .as("SameSite=Lax MUST be present to mitigate CSRF")
                                    .contains("SameSite=Lax");
                        });
    }
}
