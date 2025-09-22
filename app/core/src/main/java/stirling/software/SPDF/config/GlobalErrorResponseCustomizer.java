package stirling.software.SPDF.config;

import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springframework.stereotype.Component;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.PathItem;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;

/**
 * Global OpenAPI customizer that adds standard error responses (400, 413, 422, 500) to all API
 * operations under /api/v1/** paths.
 */
@Component
public class GlobalErrorResponseCustomizer implements GlobalOpenApiCustomizer {

    @Override
    public void customise(OpenAPI openApi) {
        if (openApi.getPaths() == null) {
            return;
        }

        openApi.getPaths()
                .forEach(
                        (path, pathItem) -> {
                            if (path.startsWith("/api/v1/")) {
                                addErrorResponsesToPathItem(pathItem);
                            }
                        });
    }

    private void addErrorResponsesToPathItem(PathItem pathItem) {
        if (pathItem.getPost() != null) {
            addStandardErrorResponses(pathItem.getPost());
        }
        if (pathItem.getPut() != null) {
            addStandardErrorResponses(pathItem.getPut());
        }
        if (pathItem.getPatch() != null) {
            addStandardErrorResponses(pathItem.getPatch());
        }
        if (pathItem.getDelete() != null) {
            addStandardErrorResponses(pathItem.getDelete());
        }
        if (pathItem.getGet() != null) {
            addStandardErrorResponses(pathItem.getGet());
        }
    }

    private void addStandardErrorResponses(Operation operation) {
        if (operation.getResponses() == null) {
            return;
        }

        // Only add error responses if they don't already exist
        if (!operation.getResponses().containsKey("400")) {
            operation.getResponses().addApiResponse("400", create400Response());
        }
        if (!operation.getResponses().containsKey("413")) {
            operation.getResponses().addApiResponse("413", create413Response());
        }
        if (!operation.getResponses().containsKey("422")) {
            operation.getResponses().addApiResponse("422", create422Response());
        }
        if (!operation.getResponses().containsKey("500")) {
            operation.getResponses().addApiResponse("500", create500Response());
        }
    }

    private ApiResponse create400Response() {
        return new ApiResponse()
                .description(
                        "Bad request - Invalid input parameters, unsupported format, or corrupted file")
                .content(
                        new Content()
                                .addMediaType(
                                        "application/json",
                                        new MediaType()
                                                .schema(
                                                        createErrorSchema(
                                                                400,
                                                                "Invalid input parameters or corrupted file",
                                                                "/api/v1/example/endpoint"))
                                                .example(
                                                        createErrorExample(
                                                                400,
                                                                "Invalid input parameters or corrupted file",
                                                                "/api/v1/example/endpoint"))));
    }

    private ApiResponse create413Response() {
        return new ApiResponse()
                .description("Payload too large - File exceeds maximum allowed size")
                .content(
                        new Content()
                                .addMediaType(
                                        "application/json",
                                        new MediaType()
                                                .schema(
                                                        createErrorSchema(
                                                                413,
                                                                "File size exceeds maximum allowed limit",
                                                                "/api/v1/example/endpoint"))
                                                .example(
                                                        createErrorExample(
                                                                413,
                                                                "File size exceeds maximum allowed limit",
                                                                "/api/v1/example/endpoint"))));
    }

    private ApiResponse create422Response() {
        return new ApiResponse()
                .description("Unprocessable entity - File is valid but cannot be processed")
                .content(
                        new Content()
                                .addMediaType(
                                        "application/json",
                                        new MediaType()
                                                .schema(
                                                        createErrorSchema(
                                                                422,
                                                                "File is valid but cannot be processed",
                                                                "/api/v1/example/endpoint"))
                                                .example(
                                                        createErrorExample(
                                                                422,
                                                                "File is valid but cannot be processed",
                                                                "/api/v1/example/endpoint"))));
    }

    private ApiResponse create500Response() {
        return new ApiResponse()
                .description("Internal server error - Unexpected error during processing")
                .content(
                        new Content()
                                .addMediaType(
                                        "application/json",
                                        new MediaType()
                                                .schema(
                                                        createErrorSchema(
                                                                500,
                                                                "Unexpected error during processing",
                                                                "/api/v1/example/endpoint"))
                                                .example(
                                                        createErrorExample(
                                                                500,
                                                                "Unexpected error during processing",
                                                                "/api/v1/example/endpoint"))));
    }

    private Schema<?> createErrorSchema(int status, String message, String path) {
        return new Schema<>()
                .type("object")
                .addProperty("status", new Schema<>().type("integer").example(status))
                .addProperty("error", new Schema<>().type("string").example(getErrorType(status)))
                .addProperty("message", new Schema<>().type("string").example(message))
                .addProperty(
                        "timestamp",
                        new Schema<>()
                                .type("string")
                                .format("date-time")
                                .example("2024-01-15T10:30:00Z"))
                .addProperty("path", new Schema<>().type("string").example(path));
    }

    private Object createErrorExample(int status, String message, String path) {
        return java.util.Map.of(
                "status", status,
                "error", getErrorType(status),
                "message", message,
                "timestamp", "2024-01-15T10:30:00Z",
                "path", path);
    }

    private String getErrorType(int status) {
        return switch (status) {
            case 400 -> "Bad Request";
            case 413 -> "Payload Too Large";
            case 422 -> "Unprocessable Entity";
            case 500 -> "Internal Server Error";
            default -> "Error";
        };
    }
}
