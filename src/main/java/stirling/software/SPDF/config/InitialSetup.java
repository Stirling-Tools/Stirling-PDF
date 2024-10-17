package stirling.software.SPDF.config;

import java.io.IOException;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Component
@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class InitialSetup {

    @Autowired private ApplicationProperties applicationProperties;

    @PostConstruct
    public void initUUIDKey() throws IOException {
        String uuid = applicationProperties.getAutomaticallyGenerated().getUUID();
        if (!GeneralUtils.isValidUUID(uuid)) {
            uuid = UUID.randomUUID().toString(); // Generating a random UUID as the secret key
            GeneralUtils.saveKeyToConfig("AutomaticallyGenerated.UUID", uuid);
            applicationProperties.getAutomaticallyGenerated().setUUID(uuid);
        }
    }

    @PostConstruct
    public void initSecretKey() throws IOException {
        String secretKey = applicationProperties.getAutomaticallyGenerated().getKey();
        if (!GeneralUtils.isValidUUID(secretKey)) {
            secretKey = UUID.randomUUID().toString(); // Generating a random UUID as the secret key
            GeneralUtils.saveKeyToConfig("AutomaticallyGenerated.key", secretKey);
            applicationProperties.getAutomaticallyGenerated().setKey(secretKey);
        }
    }
}
