package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Properties;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.MailConfig;

class MailConfigTest {

    private ApplicationProperties.Mail mailProps;

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
        when(mailProps.getConnectionTimeoutMs()).thenReturn(10_000);
        when(mailProps.getReadTimeoutMs()).thenReturn(30_000);
        when(mailProps.getWriteTimeoutMs()).thenReturn(30_000);
    }

    @Test
    void shouldConfigureJavaMailSenderWithCorrectProperties() {
        ApplicationProperties appProps = mock(ApplicationProperties.class);
        when(appProps.getMail()).thenReturn(mailProps);

        MailConfig config = new MailConfig(appProps);
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
                // Unset means infinite in JavaMail, which parks a request thread on a wedged relay
                () -> assertEquals("10000", props.getProperty("mail.smtp.connectiontimeout")),
                () -> assertEquals("30000", props.getProperty("mail.smtp.timeout")),
                () -> assertEquals("30000", props.getProperty("mail.smtp.writetimeout")),
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

        MailConfig config = new MailConfig(appProps);
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
    void smtpTimeoutsComeFromSettings() {
        // A slow corporate relay is a real configuration, so the operator's numbers must win.
        when(mailProps.getConnectionTimeoutMs()).thenReturn(45_000);
        when(mailProps.getReadTimeoutMs()).thenReturn(90_000);
        when(mailProps.getWriteTimeoutMs()).thenReturn(120_000);
        ApplicationProperties appProps = mock(ApplicationProperties.class);
        when(appProps.getMail()).thenReturn(mailProps);

        Properties props =
                ((JavaMailSenderImpl) new MailConfig(appProps).javaMailSender())
                        .getJavaMailProperties();

        assertAll(
                "operator-set SMTP timeouts",
                () -> assertEquals("45000", props.getProperty("mail.smtp.connectiontimeout")),
                () -> assertEquals("90000", props.getProperty("mail.smtp.timeout")),
                () -> assertEquals("120000", props.getProperty("mail.smtp.writetimeout")));
    }

    @Test
    void smtpTimeoutDefaultsAreFinite() {
        // The point of the change: unset must not mean infinite. Asserted on a real settings object
        // so a silently-changed default cannot pass through the mocks above.
        ApplicationProperties.Mail defaults = new ApplicationProperties.Mail();

        assertAll(
                "shipped defaults",
                () -> assertEquals(10_000, defaults.getConnectionTimeoutMs()),
                () -> assertEquals(30_000, defaults.getReadTimeoutMs()),
                () -> assertEquals(30_000, defaults.getWriteTimeoutMs()));
    }
}
