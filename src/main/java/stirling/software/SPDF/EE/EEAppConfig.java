package stirling.software.SPDF.EE;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class EEAppConfig {

    @Autowired ApplicationProperties applicationProperties;
    @Autowired private LicenseKeyChecker licenseKeyChecker;

    @Bean(name = "runningEE")
    public boolean runningEnterpriseEdition() {
        return licenseKeyChecker.getEnterpriseEnabledResult();
    }
}
