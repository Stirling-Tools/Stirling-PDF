package stirling.software.common.model.api;

// TODO: Migration required - org.springframework.web.multipart.MultipartFile has no
// JAX-RS drop-in. This is a public DTO field exposed via Lombok getters/setters and
// consumed by controllers/services across the codebase; changing the type (e.g. to
// byte[]/InputStream or jakarta.ws.rs form params) would ripple to every caller.
// Keep the Spring type for now and rebind during the web-layer migration.
import stirling.software.common.model.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class GeneralFile {

    @Schema(
            description = "The input file",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private MultipartFile fileInput;
}
