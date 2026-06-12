package stirling.software.proprietary.security.configuration;

import java.util.Properties;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;

// TODO: Migration required - org.springframework.mail.javamail.* is Spring's mail abstraction, NOT
// Spring DI. There is no Quarkus equivalent that the EmailService collaborator can consume without
// also migrating EmailService (which uses MimeMessage/MimeMessageHelper). Quarkus ships
// quarkus-mailer (io.quarkus.mailer.Mailer / ReactiveMailer) with a different API. Keep the Spring
// Mail types here until EmailService is migrated together, then swap the producer to expose a
// Quarkus Mailer (configured via quarkus.mailer.* in application.properties).
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * This configuration class provides the JavaMailSender bean, which is used to send emails. It reads
 * email server settings from the configuration (ApplicationProperties) and configures the mail
 * client (JavaMailSender).
 */
@ApplicationScoped
@Slf4j
public class MailConfig {

    private final ApplicationProperties applicationProperties;

    @Inject
    public MailConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    // TODO: Migration required - the original bean was guarded by
    // @ConditionalOnProperty(value = "mail.enabled", havingValue = "true", matchIfMissing = false).
    // There is no @ConditionalOnProperty in Quarkus. A build-time toggle could use
    // @io.quarkus.arc.lookup.LookupIfProperty(name = "mail.enabled", stringValue = "true"), but
    // mail.enabled is a runtime property (ApplicationProperties.Mail#isEnabled). Consumers already
    // guard on applicationProperties.getMail().isEnabled() at call time, so the bean is always
    // produced and the runtime guard remains the source of truth.
    @Produces
    @ApplicationScoped
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
