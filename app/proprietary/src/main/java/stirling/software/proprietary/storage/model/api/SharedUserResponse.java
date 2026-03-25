package stirling.software.proprietary.storage.model.api;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class SharedUserResponse {
    private final String username;
    private final String accessRole;
}
