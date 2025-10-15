package stirling.software.common.model.user;

import java.io.Serializable;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Data Transfer Object for User information. Used to transfer user data between layers without
 * exposing sensitive information like passwords or API keys.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;

    private String username;

    private boolean enabled;

    private boolean firstLogin;

    private String authenticationType;

    private String roleName;

    private Long teamId;

    private String teamName;

    private Map<String, String> settings;
}
