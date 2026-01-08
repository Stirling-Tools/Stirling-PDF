package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ShareLinkAccessResponse {
    private final String username;
    private final String accessType;
    private final LocalDateTime accessedAt;
}
