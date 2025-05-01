package stirling.software.SPDF.config.security.mail;

import java.util.Properties;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;

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
        mailSender.setHost(mailProperties.getHost());
        mailSender.setPort(mailProperties.getPort());
        mailSender.setUsername(mailProperties.getUsername());
        mailSender.setPassword(mailProperties.getPassword());
        mailSender.setDefaultEncoding("UTF-8");

        // Retrieves the JavaMail properties to configure additional SMTP parameters
        Properties props = mailSender.getJavaMailProperties();

        // Enables SMTP authentication
        props.put("mail.smtp.auth", "true");

        // Enables STARTTLS to encrypt the connection if supported by the SMTP server
        props.put("mail.smtp.starttls.enable", "true");

        // Returns the configured mail sender, ready to send emails
        return mailSender;
    }
}
