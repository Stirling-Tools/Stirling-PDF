<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/model/PersistentLogin.java
package stirling.software.proprietary.security.model;
========
package stirling.software.enterprise.security.model;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/model/PersistentLogin.java

import java.util.Date;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Data;

@Entity
@Table(name = "persistent_logins")
@Data
public class PersistentLogin {

    @Id
    @Column(name = "series")
    private String series;

    @Column(name = "username", length = 64, nullable = false)
    private String username;

    @Column(name = "token", length = 64, nullable = false)
    private String token;

    @Column(name = "last_used", nullable = false)
    private Date lastUsed;
}
