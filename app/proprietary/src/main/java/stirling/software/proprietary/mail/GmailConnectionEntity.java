package stirling.software.proprietary.mail;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.integration.crypto.EncryptedStringConverter;

/** Durable, user-owned Gmail OAuth connection. OAuth secrets are encrypted at rest. */
@Entity
@Table(name = "gmail_oauth_connections")
@NoArgsConstructor
@Getter
@Setter
public class GmailConnectionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, unique = true, length = 255)
    private String username;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "access_token", nullable = false, length = 4096)
    private String accessToken;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "refresh_token", nullable = false, length = 4096)
    private String refreshToken;

    @Column(name = "expires_at", nullable = false)
    private long expiresAt;

    @Column(name = "email", nullable = false, length = 320)
    private String email;

    @Column(name = "display_name", length = 255)
    private String displayName;
}
