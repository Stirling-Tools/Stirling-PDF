package stirling.software.SPDF.config.swagger;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;

/**
 * API response annotation for filter operations that conditionally return the original file. Use
 * for operations like text filters, page count filters, size filters, etc. Returns the original PDF
 * if condition is met, otherwise returns no content (204).
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "Filter condition met - returns the original PDF file",
                    content =
                            @Content(
                                    mediaType = "application/pdf",
                                    schema =
                                            @Schema(
                                                    type = "string",
                                                    format = "binary",
                                                    description = "The original PDF file"))),
            @ApiResponse(
                    responseCode = "204",
                    description = "Filter condition not met - no content returned",
                    content = @Content()),
            @ApiResponse(
                    responseCode = "400",
                    description = "Bad request - Invalid filter parameters or corrupted PDF",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "413",
                    description = "Payload too large - File exceeds maximum allowed size",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "422",
                    description =
                            "Unprocessable entity - PDF is valid but cannot be analyzed for filtering",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "500",
                    description = "Internal server error - Unexpected error during PDF analysis",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface FilterResponse {}
