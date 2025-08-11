package stirling.software.proprietary.security.model;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@NoArgsConstructor
@ToString(onlyExplicitlyIncluded = true)
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class JwtVerificationKey implements Serializable {

    @Serial private static final long serialVersionUID = 1L;

    @ToString.Include private String keyId;

    private String verifyingKey;

    @ToString.Include private LocalDateTime createdAt;

    public JwtVerificationKey(String keyId, String verifyingKey) {
        this.keyId = keyId;
        this.verifyingKey = verifyingKey;
        this.createdAt = LocalDateTime.now();
    }
}
