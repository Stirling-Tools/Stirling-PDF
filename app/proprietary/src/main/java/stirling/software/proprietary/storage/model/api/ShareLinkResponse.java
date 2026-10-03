package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Getter;

import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.annotation.JsonPOJOBuilder;

@Getter
@Builder
@JsonDeserialize(builder = ShareLinkResponse.ShareLinkResponseBuilder.class)
public class ShareLinkResponse {
    private final String token;
    private final String accessRole;
    private final LocalDateTime createdAt;
    private final LocalDateTime expiresAt;

    /** Declared so Lombok fills it in; the annotation is what Jackson needs to use it. */
    @JsonPOJOBuilder(withPrefix = "")
    public static class ShareLinkResponseBuilder {}
}
