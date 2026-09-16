package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Properties;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.mail.autoconfigure.MailProperties;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.MailConfig;

class MailConfigTest {

    private ApplicationProperties.Mail mailProps;
    private MailProperties springMail;

    @BeforeEach
    void initMailProperties() {
        mailProps = mock(ApplicationProperties.Mail.class);
        when(mailProps.getHost()).thenReturn("smtp.example.com");
        when(mailProps.getPort()).thenReturn(587);
        when(mailProps.getUsername()).thenReturn("user@example.com");
        when(mailProps.getPassword()).thenReturn("password");
        when(mailProps.getStartTlsEnable()).thenReturn(null);
        when(mailProps.getStartTlsRequired()).thenReturn(null);
        when(mailProps.getSslEnable()).thenReturn(null);
        when(mailProps.getSslTrust()).thenReturn(null);
        when(mailProps.getSslCheckServerIdentity()).thenReturn(null);
        springMail = new MailProperties();
        springMail.getProperties().put("mail.smtp.timeout", "30000");
    }

    @Test
    void shouldConfigureJavaMailSenderWithCorrectProperties() {
        ApplicationProperties appProps = mock(ApplicationProperties.class);
        when(appProps.getMail()).thenReturn(mailProps);

        MailConfig config = new MailConfig(appProps, springMail);
        JavaMailSender sender = config.javaMailSender();

        assertInstanceOf(JavaMailSenderImpl.class, sender);
        JavaMailSenderImpl impl = (JavaMailSenderImpl) sender;

        Properties props = impl.getJavaMailProperties();

        assertAll(
                "SMTP configuration",
                () -> assertEquals("smtp.example.com", impl.getHost()),
                () -> assertEquals(587, impl.getPort()),
                () -> assertEquals("user@example.com", impl.getUsername()),
                () -> assertEquals("password", impl.getPassword()),
                () -> assertEquals("UTF-8", impl.getDefaultEncoding()),
                () -> assertEquals("true", props.getProperty("mail.smtp.auth")),
                () -> assertEquals("true", props.getProperty("mail.smtp.starttls.enable")),
                () -> assertEquals(null, props.getProperty("mail.smtp.starttls.required")),
                () -> assertEquals(null, props.getProperty("mail.smtp.ssl.enable")),
                () -> assertEquals("*", props.getProperty("mail.smtp.ssl.trust")));
    }

    @Test
    void shouldRespectExplicitTlsOverrides() {
        ApplicationProperties appProps = mock(ApplicationProperties.class);
        when(mailProps.getStartTlsEnable()).thenReturn(false);
        when(mailProps.getStartTlsRequired()).thenReturn(true);
        when(mailProps.getSslEnable()).thenReturn(true);
        when(mailProps.getSslTrust()).thenReturn("*");
        when(mailProps.getSslCheckServerIdentity()).thenReturn(true);
        when(appProps.getMail()).thenReturn(mailProps);

        MailConfig config = new MailConfig(appProps, springMail);
        JavaMailSenderImpl impl = (JavaMailSenderImpl) config.javaMailSender();

        Properties props = impl.getJavaMailProperties();

        assertAll(
                () -> assertEquals("false", props.getProperty("mail.smtp.starttls.enable")),
                () -> assertEquals("true", props.getProperty("mail.smtp.starttls.required")),
                () -> assertEquals("true", props.getProperty("mail.smtp.ssl.enable")),
                () -> assertEquals("*", props.getProperty("mail.smtp.ssl.trust")),
                () -> assertEquals("true", props.getProperty("mail.smtp.ssl.checkserveridentity")));
    }

    @Test
    void springMailPropertiesReachTheSender() {
        springMail.getProperties().put("mail.smtp.connectiontimeout", "45000");
        ApplicationProperties appProps = mock(ApplicationProperties.class);
        when(appProps.getMail()).thenReturn(mailProps);

        Properties props =
                ((JavaMailSenderImpl) new MailConfig(appProps, springMail).javaMailSender())
                        .getJavaMailProperties();

        assertAll(
                "inherited from spring.mail.properties",
                () -> assertEquals("45000", props.getProperty("mail.smtp.connectiontimeout")),
                () -> assertEquals("30000", props.getProperty("mail.smtp.timeout")));
    }
}
