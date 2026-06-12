package stirling.software.SPDF.config;

import java.util.Map;

import org.eclipse.microprofile.openapi.OASFactory;
import org.eclipse.microprofile.openapi.OASFilter;
import org.eclipse.microprofile.openapi.models.OpenAPI;
import org.eclipse.microprofile.openapi.models.Operation;
import org.eclipse.microprofile.openapi.models.PathItem;
import org.eclipse.microprofile.openapi.models.media.Content;
import org.eclipse.microprofile.openapi.models.media.MediaType;
import org.eclipse.microprofile.openapi.models.media.Schema;
import org.eclipse.microprofile.openapi.models.responses.APIResponse;

/**
 * Global OpenAPI customizer that adds standard error responses (400, 413, 422, 500) to all API
 * operations under /api/v1/** paths.
 *
 * <p>Migrated from a springdoc {@code GlobalOpenApiCustomizer} to a MicroProfile {@link OASFilter}
 * (quarkus-smallrye-openapi). Register this filter via {@code mp.openapi.filter} in
 * application.properties, e.g.
 * {@code mp.openapi.filter=stirling.software.SPDF.config.GlobalErrorResponseCustomizer}.
 */
public class GlobalErrorResponseCustomizer implements OASFilter {

    @Override
    public void filterOpenAPI(OpenAPI openApi) {
        if (openApi.getPaths() == null || openApi.getPaths().getPathItems() == null) {
            return;
        }

        openApi.getPaths()
                .getPathItems()
                .forEach(
                        (path, pathItem) -> {
                            if (path.startsWith("/api/v1/")) {
                                addErrorResponsesToPathItem(pathItem);
                            }
                        });
    }

    private void addErrorResponsesToPathItem(PathItem pathItem) {
        if (pathItem.getPOST() != null) {
            addStandardErrorResponses(pathItem.getPOST());
        }
        if (pathItem.getPUT() != null) {
            addStandardErrorResponses(pathItem.getPUT());
        }
        if (pathItem.getPATCH() != null) {
            addStandardErrorResponses(pathItem.getPATCH());
        }
        if (pathItem.getDELETE() != null) {
            addStandardErrorResponses(pathItem.getDELETE());
        }
        if (pathItem.getGET() != null) {
            addStandardErrorResponses(pathItem.getGET());
        }
    }

    private void addStandardErrorResponses(Operation operation) {
        if (operation.getResponses() == null) {
            return;
        }

        // Only add error responses if they don't already exist
        if (!operation.getResponses().hasAPIResponse("400")) {
            operation.getResponses().addAPIResponse("400", create400Response());
        }
        if (!operation.getResponses().hasAPIResponse("413")) {
            operation.getResponses().addAPIResponse("413", create413Response());
        }
        if (!operation.getResponses().hasAPIResponse("422")) {
            operation.getResponses().addAPIResponse("422", create422Response());
        }
        if (!operation.getResponses().hasAPIResponse("500")) {
            operation.getResponses().addAPIResponse("500", create500Response());
        }
    }

    private APIResponse create400Response() {
        return OASFactory.createAPIResponse()
                .description(
                        "Bad request - Invalid input parameters, unsupported format, or corrupted file")
                .content(
                        OASFactory.createContent()
                                .addMediaType(
                                        "application/json",
                                        createMediaType(
                                                400,
                                                "Invalid input parameters or corrupted file",
                                                "/api/v1/example/endpoint")));
    }

    private APIResponse create413Response() {
        return OASFactory.createAPIResponse()
                .description("Payload too large - File exceeds maximum allowed size")
                .content(
                        OASFactory.createContent()
                                .addMediaType(
                                        "application/json",
                                        createMediaType(
                                                413,
                                                "File size exceeds maximum allowed limit",
                                                "/api/v1/example/endpoint")));
    }

    private APIResponse create422Response() {
        return OASFactory.createAPIResponse()
                .description("Unprocessable entity - File is valid but cannot be processed")
                .content(
                        OASFactory.createContent()
                                .addMediaType(
                                        "application/json",
                                        createMediaType(
                                                422,
                                                "File is valid but cannot be processed",
                                                "/api/v1/example/endpoint")));
    }

    private APIResponse create500Response() {
        return OASFactory.createAPIResponse()
                .description("Internal server error - Unexpected error during processing")
                .content(
                        OASFactory.createContent()
                                .addMediaType(
                                        "application/json",
                                        createMediaType(
                                                500,
                                                "Unexpected error during processing",
                                                "/api/v1/example/endpoint")));
    }

    private MediaType createMediaType(int status, String message, String path) {
        return OASFactory.createMediaType()
                .schema(createErrorSchema(status, message, path))
                .example(createErrorExample(status, message, path));
    }

    private Schema createErrorSchema(int status, String message, String path) {
        return OASFactory.createSchema()
                .addType(Schema.SchemaType.OBJECT)
                .addProperty(
                        "status",
                        OASFactory.createSchema()
                                .addType(Schema.SchemaType.INTEGER)
                                .example(status))
                .addProperty(
                        "error",
                        OASFactory.createSchema()
                                .addType(Schema.SchemaType.STRING)
                                .example(getErrorType(status)))
                .addProperty(
                        "message",
                        OASFactory.createSchema()
                                .addType(Schema.SchemaType.STRING)
                                .example(message))
                .addProperty(
                        "timestamp",
                        OASFactory.createSchema()
                                .addType(Schema.SchemaType.STRING)
                                .format("date-time")
                                .example("2024-01-15T10:30:00Z"))
                .addProperty(
                        "path",
                        OASFactory.createSchema()
                                .addType(Schema.SchemaType.STRING)
                                .example(path));
    }

    private Object createErrorExample(int status, String message, String path) {
        return Map.of(
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
