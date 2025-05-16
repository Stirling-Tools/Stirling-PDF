package stirling.software.SPDF.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class Username {

    @Schema(description = "username of user", requiredMode = Schema.RequiredMode.REQUIRED)
    private String username;
}
