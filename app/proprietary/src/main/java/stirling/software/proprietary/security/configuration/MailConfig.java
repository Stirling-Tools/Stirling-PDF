package stirling.software.proprietary.security.configuration;

import java.util.Properties;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * This configuration class provides the JavaMailSender bean, which is used to send emails. It reads
 * email server settings from the configuration (ApplicationProperties) and configures the mail
 * client (JavaMailSender).
 */
@Configuration
@Slf4j
@AllArgsConstructor
@ConditionalOnProperty(value = "mail.enabled", havingValue = "true", matchIfMissing = false)
public class MailConfig {

    private final ApplicationProperties applicationProperties;

    @Bean
    public JavaMailSender javaMailSender() {

        ApplicationProperties.Mail mailProperties = applicationProperties.getMail();

        // Creates a new instance of JavaMailSenderImpl, which is a Spring implementation
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
        String host = mailProperties.getHost();
        mailSender.setHost(host);
        mailSender.setPort(mailProperties.getPort());
        mailSender.setDefaultEncoding("UTF-8");

        // Only set username and password if they are provided
        String username = mailProperties.getUsername();
        String password = mailProperties.getPassword();
        boolean hasCredentials =
                (username != null && !username.trim().isEmpty())
                        || (password != null && !password.trim().isEmpty());

        if (username != null && !username.trim().isEmpty()) {
            mailSender.setUsername(username);
            log.info("SMTP username configured");
        } else {
            log.info("SMTP username not configured - using anonymous connection");
        }

        if (password != null && !password.trim().isEmpty()) {
            mailSender.setPassword(password);
            log.info("SMTP password configured");
        } else {
            log.info("SMTP password not configured");
        }

        // Retrieves the JavaMail properties to configure additional SMTP parameters
        Properties props = mailSender.getJavaMailProperties();

        // Only enable SMTP authentication if credentials are provided
        if (hasCredentials) {
            props.put("mail.smtp.auth", "true");
            log.info("SMTP authentication enabled");
        } else {
            props.put("mail.smtp.auth", "false");
            log.info("SMTP authentication disabled - no credentials provided");
        }

        boolean startTlsEnabled =
                mailProperties.getStartTlsEnable() == null || mailProperties.getStartTlsEnable();
        // Enables STARTTLS to encrypt the connection if supported by the SMTP server
        props.put("mail.smtp.starttls.enable", Boolean.toString(startTlsEnabled));
        if (mailProperties.getStartTlsRequired() != null) {
            props.put(
                    "mail.smtp.starttls.required", mailProperties.getStartTlsRequired().toString());
        }

        if (mailProperties.getSslEnable() != null) {
            props.put("mail.smtp.ssl.enable", mailProperties.getSslEnable().toString());
        }

        // Trust the configured host to allow STARTTLS with self-signed certificates
        String sslTrust = mailProperties.getSslTrust();
        if (sslTrust == null || sslTrust.trim().isEmpty()) {
            sslTrust = "*";
        }
        if (sslTrust != null && !sslTrust.trim().isEmpty()) {
            props.put("mail.smtp.ssl.trust", sslTrust);
        }
        if (mailProperties.getSslCheckServerIdentity() != null) {
            props.put(
                    "mail.smtp.ssl.checkserveridentity",
                    mailProperties.getSslCheckServerIdentity().toString());
        }

        // Returns the configured mail sender, ready to send emails
        return mailSender;
    }
}
