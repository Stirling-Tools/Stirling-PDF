package stirling.software.SPDF.EE;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@Lazy
@Slf4j
public class EEAppConfig {

    @Autowired ApplicationProperties applicationProperties;
    @Autowired private LicenseKeyChecker licenseKeyChecker;

    @Bean(name = "runningEE")
    public boolean runningEnterpriseEdition() {
    	return licenseKeyChecker.getEnterpriseEnabledResult();
    }
}