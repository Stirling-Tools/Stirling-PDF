package stirling.software.proprietary.cache;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

import stirling.software.proprietary.cluster.valkey.ConditionalOnValkeyBackplane;

import tools.jackson.databind.ObjectMapper;

@Configuration
public class CacheEvictionConfiguration {

    @Bean
    @ConditionalOnValkeyBackplane
    ValkeyCacheEvictionBroadcaster valkeyCacheEvictionBroadcaster(
            StringRedisTemplate template,
            SecondLevelCacheEvictor evictor,
            ObjectMapper objectMapper) {
        return new ValkeyCacheEvictionBroadcaster(template, evictor, objectMapper);
    }

    @Bean
    @ConditionalOnValkeyBackplane
    RedisMessageListenerContainer cacheEvictionListenerContainer(
            RedisConnectionFactory connectionFactory, ValkeyCacheEvictionBroadcaster broadcaster) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(
                broadcaster, new ChannelTopic(ValkeyCacheEvictionBroadcaster.CHANNEL));
        return container;
    }

    // Negation of @ConditionalOnValkeyBackplane: exactly one broadcaster bean exists.
    @Bean
    @ConditionalOnExpression(
            "!(${cluster.enabled:false} and '${cluster.backplane:inprocess}'.equals('valkey'))")
    LocalCacheEvictionBroadcaster localCacheEvictionBroadcaster(SecondLevelCacheEvictor evictor) {
        return new LocalCacheEvictionBroadcaster(evictor);
    }
}
