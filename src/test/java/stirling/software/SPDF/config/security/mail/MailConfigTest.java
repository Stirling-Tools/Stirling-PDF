package stirling.software.SPDF.config.security.mail;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Properties;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import stirling.software.SPDF.model.ApplicationProperties;

class MailConfigTest {

    private ApplicationProperties.Mail mailProps;

    @BeforeEach
    void initMailProperties() {
        mailProps = mock(ApplicationProperties.Mail.class);
        when(mailProps.getHost()).thenReturn("smtp.example.com");
        when(mailProps.getPort()).thenReturn(587);
        when(mailProps.getUsername()).thenReturn("user@example.com");
        when(mailProps.getPassword()).thenReturn("password");
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
                () -> assertEquals("true", props.getProperty("mail.smtp.starttls.enable")));
    }
}
