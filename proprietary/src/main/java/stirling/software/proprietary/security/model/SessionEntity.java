package stirling.software.proprietary.security.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Date;
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
