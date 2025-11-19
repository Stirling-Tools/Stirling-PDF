package stirling.software.proprietary.config;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.extern.slf4j.Slf4j;

import redis.clients.jedis.Connection;
import redis.clients.jedis.DefaultJedisClientConfig;
import redis.clients.jedis.HostAndPort;
import redis.clients.jedis.JedisClientConfig;
import redis.clients.jedis.JedisPooled;

@Configuration
@ConditionalOnProperty(value = "premium.proFeatures.chatbot.enabled", havingValue = "true")
@Slf4j
public class ChatbotRedisConfig {

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Value("${spring.data.redis.password:}")
    private String redisPassword;

    @Value("${spring.data.redis.timeout:60000}")
    private int redisTimeout;

    @Value("${spring.data.redis.ssl.enabled:false}")
    private boolean sslEnabled;

    @Bean
    public JedisPooled jedisPooled() {
        try {
            log.info("Creating JedisPooled connection to {}:{}", redisHost, redisPort);

            // Create pool configuration
            GenericObjectPoolConfig<Connection> poolConfig = new GenericObjectPoolConfig<>();
            poolConfig.setMaxTotal(50);
            poolConfig.setMaxIdle(25);
            poolConfig.setMinIdle(5);
            poolConfig.setTestOnBorrow(true);
            poolConfig.setTestOnReturn(true);
            poolConfig.setTestWhileIdle(true);

            // Create host and port configuration
            HostAndPort hostAndPort = new HostAndPort(redisHost, redisPort);

            // Create client configuration with authentication if password is provided
            JedisClientConfig clientConfig;
            if (redisPassword != null && !redisPassword.trim().isEmpty()) {
                clientConfig =
                        DefaultJedisClientConfig.builder()
                                .password(redisPassword)
                                .connectionTimeoutMillis(redisTimeout)
                                .socketTimeoutMillis(redisTimeout)
                                .ssl(sslEnabled)
                                .build();
            } else {
                clientConfig =
                        DefaultJedisClientConfig.builder()
                                .connectionTimeoutMillis(redisTimeout)
                                .socketTimeoutMillis(redisTimeout)
                                .ssl(sslEnabled)
                                .build();
            }

            // Create JedisPooled with configuration
            JedisPooled jedisPooled = new JedisPooled(poolConfig, hostAndPort, clientConfig);

            // Test the connection
            try {
                jedisPooled.ping();
                log.info("Successfully connected to Redis at {}:{}", redisHost, redisPort);
            } catch (Exception pingException) {
                log.warn(
                        "Redis ping failed at {}:{} - {}. Redis might be unavailable.",
                        redisHost,
                        redisPort,
                        pingException.getMessage());
                // Close the pool if ping fails
                try {
                    jedisPooled.close();
                } catch (Exception closeException) {
                    // Ignore close exceptions
                }
                return null;
            }

            return jedisPooled;
        } catch (Exception e) {
            log.error("Failed to create JedisPooled connection", e);
            // Return null to fall back to SimpleVectorStore
            return null;
        }
    }
}
