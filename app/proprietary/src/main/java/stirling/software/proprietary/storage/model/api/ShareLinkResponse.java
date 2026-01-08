package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ShareLinkResponse {
    private final String token;
    private final boolean publicLink;
    private final LocalDateTime createdAt;
}
