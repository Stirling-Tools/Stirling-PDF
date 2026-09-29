package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.integration.crypto.EncryptedStringConverter;

/** A JWT signing keypair in the shared DB; the private key is encrypted at rest. */
@Entity
@Table(name = "jwt_signing_keys")
@NoArgsConstructor
@Getter
@Setter
public class JwtSigningKeyEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "key_id", length = 128)
    private String keyId;

    // Base64 X.509 public key (non-secret).
    @Column(name = "verifying_key", columnDefinition = "text", nullable = false)
    private String verifyingKey;

    // Base64 PKCS#8 private key, encrypted at rest.
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "signing_key", columnDefinition = "text", nullable = false)
    private String signingKey;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public JwtSigningKeyEntity(String keyId, String verifyingKey, String signingKey) {
        this.keyId = keyId;
        this.verifyingKey = verifyingKey;
        this.signingKey = signingKey;
    }
}
