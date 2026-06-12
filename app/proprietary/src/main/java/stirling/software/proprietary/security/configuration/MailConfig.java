package stirling.software.proprietary.security.configuration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * This configuration class used to provide the Spring JavaMailSender bean. After the Quarkus
 * migration, mail sending is handled by Quarkus' built-in {@code io.quarkus.mailer.Mailer}, which is
 * auto-provided by the quarkus-mailer extension and injected directly where needed (e.g. in
 * EmailService). There is therefore no longer a producer method here.
 *
 * <p>TODO: Migration required - the SMTP connection settings previously configured programmatically
 * from {@link ApplicationProperties.Mail} (host, port, username, password, STARTTLS, SSL, trust,
 * checkserveridentity) must instead be expressed as {@code quarkus.mailer.*} properties in
 * application.properties / runtime config:
 *
 * <pre>
 *   quarkus.mailer.host                = ${mail.host}
 *   quarkus.mailer.port                = ${mail.port}
 *   quarkus.mailer.username            = ${mail.username}
 *   quarkus.mailer.password            = ${mail.password}
 *   quarkus.mailer.start-tls           = REQUIRED | OPTIONAL | DISABLED   (was mail.smtp.starttls.*)
 *   quarkus.mailer.ssl                 = ${mail.sslEnable}
 *   quarkus.mailer.trust-all           = true   (was mail.smtp.ssl.trust = *)
 *   quarkus.mailer.from                = ...
 * </pre>
 *
 * <p>The original bean was guarded by @ConditionalOnProperty("mail.enabled"), which has no Quarkus
 * equivalent. Consumers already guard on {@code applicationProperties.getMail().isEnabled()} at call
 * time, so that runtime guard remains the source of truth.
 */
@ApplicationScoped
@Slf4j
public class MailConfig {

    private final ApplicationProperties applicationProperties;

    @Inject
    public MailConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public ApplicationProperties.Mail getMailProperties() {
        return applicationProperties.getMail();
    }
}
