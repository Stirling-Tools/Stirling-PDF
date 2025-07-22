package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Entity
@Getter
@Setter
@NoArgsConstructor
@Table(name = "signing_keys")
@ToString(onlyExplicitlyIncluded = true)
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class JwtSigningKey implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "signing_key_id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @Column(name = "key_id", nullable = false, unique = true)
    @ToString.Include
    private String keyId;

    @Column(name = "signing_key", columnDefinition = "TEXT", nullable = false)
    private String signingKey;

    @Column(name = "algorithm", nullable = false)
    private String algorithm = "RS256";

    @Column(name = "created_at", nullable = false)
    @ToString.Include
    private LocalDateTime createdAt;

    @Column(name = "is_active", nullable = false)
    @ToString.Include
    private Boolean isActive = true;

    public JwtSigningKey(String keyId, String signingKey, String algorithm) {
        this.keyId = keyId;
        this.signingKey = signingKey;
        this.algorithm = algorithm;
        this.createdAt = LocalDateTime.now();
        this.isActive = true;
    }
}
