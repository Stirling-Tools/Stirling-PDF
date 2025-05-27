package stirling.software.SPDF.config;

import java.io.IOException;
import java.util.Properties;
import java.util.UUID;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import io.micrometer.common.util.StringUtils;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtil;

@Component
@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
@RequiredArgsConstructor
public class InitialSetup {

    private final ApplicationProperties applicationProperties;

    @PostConstruct
    public void init() throws IOException {
        initUUIDKey();
        initSecretKey();
        initEnableCSRFSecurity();
        initLegalUrls();
        initSetAppVersion();
    }

    public void initUUIDKey() throws IOException {
        String uuid = applicationProperties.getAutomaticallyGenerated().getUUID();
        if (!GeneralUtil.isValidUUID(uuid)) {
            // Generating a random UUID as the secret key
            uuid = UUID.randomUUID().toString();
            GeneralUtil.saveKeyToSettings("AutomaticallyGenerated.UUID", uuid);
            applicationProperties.getAutomaticallyGenerated().setUUID(uuid);
        }
    }

    public void initSecretKey() throws IOException {
        String secretKey = applicationProperties.getAutomaticallyGenerated().getKey();
        if (!GeneralUtil.isValidUUID(secretKey)) {
            // Generating a random UUID as the secret key
            secretKey = UUID.randomUUID().toString();
            GeneralUtil.saveKeyToSettings("AutomaticallyGenerated.key", secretKey);
            applicationProperties.getAutomaticallyGenerated().setKey(secretKey);
        }
    }

    public void initEnableCSRFSecurity() throws IOException {
        if (GeneralUtil.isVersionHigher(
                "0.36.0", applicationProperties.getAutomaticallyGenerated().getAppVersion())) {
            Boolean csrf = applicationProperties.getSecurity().getCsrfDisabled();
            if (!csrf) {
                GeneralUtil.saveKeyToSettings("security.csrfDisabled", false);
                GeneralUtil.saveKeyToSettings("system.enableAnalytics", true);
                applicationProperties.getSecurity().setCsrfDisabled(false);
            }
        }
    }

    public void initLegalUrls() throws IOException {
        // Initialize Terms and Conditions
        String termsUrl = applicationProperties.getLegal().getTermsAndConditions();
        if (StringUtils.isEmpty(termsUrl)) {
            String defaultTermsUrl = "https://www.stirlingpdf.com/terms";
            GeneralUtil.saveKeyToSettings("legal.termsAndConditions", defaultTermsUrl);
            applicationProperties.getLegal().setTermsAndConditions(defaultTermsUrl);
        }
        // Initialize Privacy Policy
        String privacyUrl = applicationProperties.getLegal().getPrivacyPolicy();
        if (StringUtils.isEmpty(privacyUrl)) {
            String defaultPrivacyUrl = "https://www.stirlingpdf.com/privacy-policy";
            GeneralUtil.saveKeyToSettings("legal.privacyPolicy", defaultPrivacyUrl);
            applicationProperties.getLegal().setPrivacyPolicy(defaultPrivacyUrl);
        }
    }

    public void initSetAppVersion() throws IOException {
        String appVersion = "0.0.0";
        Resource resource = new ClassPathResource("version.properties");
        Properties props = new Properties();
        try {
            props.load(resource.getInputStream());
            appVersion = props.getProperty("version");
        } catch (Exception e) {
        }
        GeneralUtil.saveKeyToSettings("AutomaticallyGenerated.appVersion", appVersion);
        applicationProperties.getAutomaticallyGenerated().setAppVersion(appVersion);
    }
}
