package stirling.software.proprietary.cache;

import java.util.List;

import org.springframework.data.redis.core.StringRedisTemplate;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;

/** Checked once by publishing an empty batch, which peers apply as a no-op. */
@Slf4j
public class CacheEvictionChannelProbe {

    private final StringRedisTemplate template;
    private final ObjectMapper objectMapper;
    private volatile Boolean usable;

    public CacheEvictionChannelProbe(StringRedisTemplate template, ObjectMapper objectMapper) {
        this.template = template;
        this.objectMapper = objectMapper;
    }

    public boolean isUsable() {
        Boolean result = usable;
        if (result == null) {
            synchronized (this) {
                if (usable == null) {
                    usable = probe();
                }
                result = usable;
            }
        }
        return result;
    }

    private boolean probe() {
        try {
            template.convertAndSend(
                    ValkeyCacheEvictionBroadcaster.CHANNEL,
                    objectMapper.writeValueAsString(
                            new ValkeyCacheEvictionBroadcaster.Envelope("probe", List.of())));
            return true;
        } catch (RuntimeException ex) {
            log.error(
                    "Cannot publish to Valkey channel {}, so this node will not keep entries in the"
                            + " Hibernate second-level cache. If the Valkey user has an ACL, grant it"
                            + " '&{}'. Cause: {}",
                    ValkeyCacheEvictionBroadcaster.CHANNEL,
                    ValkeyCacheEvictionBroadcaster.CHANNEL,
                    ex.toString());
            return false;
        }
    }
}
