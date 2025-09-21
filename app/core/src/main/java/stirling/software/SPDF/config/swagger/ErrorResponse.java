package stirling.software.SPDF.config.swagger;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Schema(description = "Standard error response")
public class ErrorResponse {

    @Schema(description = "HTTP status code", example = "400")
    private int status;

    @Schema(
            description = "Error message describing what went wrong",
            example = "Invalid PDF file or corrupted data")
    private String message;

    @Schema(description = "Timestamp when the error occurred", example = "2024-01-15T10:30:00Z")
    private String timestamp;

    @Schema(
            description = "Request path where the error occurred",
            example = "/api/v1/{endpoint-path}")
    private String path;
}
