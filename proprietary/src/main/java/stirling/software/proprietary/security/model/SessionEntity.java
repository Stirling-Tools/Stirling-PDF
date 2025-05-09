<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/model/SessionEntity.java
package stirling.software.proprietary.security.model;
========
package stirling.software.enterprise.security.model;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/model/SessionEntity.java

import java.io.Serializable;
import java.util.Date;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Data;

@Entity
@Data
@Table(name = "sessions")
public class SessionEntity implements Serializable {
    @Id private String sessionId;

    private String principalName;

    private Date lastRequest;

    private boolean expired;
}
