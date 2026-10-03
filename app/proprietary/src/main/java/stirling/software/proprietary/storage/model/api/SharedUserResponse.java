package stirling.software.proprietary.storage.model.api;

import lombok.Builder;
import lombok.Getter;

import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.annotation.JsonPOJOBuilder;

@Getter
@Builder
@JsonDeserialize(builder = SharedUserResponse.SharedUserResponseBuilder.class)
public class SharedUserResponse {
    private final String username;
    private final String accessRole;

    /** Declared so Lombok fills it in; the annotation is what Jackson needs to use it. */
    @JsonPOJOBuilder(withPrefix = "")
    public static class SharedUserResponseBuilder {}
}
