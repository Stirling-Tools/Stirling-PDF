package stirling.software.common.model.api.security;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserSummaryDTO {
    private Long userId;
    private String username;
    private String displayName;
    private String teamName;
    private boolean enabled;
}
