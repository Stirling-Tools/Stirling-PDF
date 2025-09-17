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
 * API response annotation for JavaScript extraction from PDFs. Use for endpoints that extract
 * JavaScript code from PDF documents.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "JavaScript extracted successfully from PDF",
                    content =
                            @Content(
                                    mediaType = "text/plain",
                                    schema =
                                            @Schema(
                                                    type = "string",
                                                    format = "binary",
                                                    description =
                                                            "JavaScript code extracted from PDF"))),
            @ApiResponse(
                    responseCode = "400",
                    description =
                            "Bad request - Invalid input parameters, unsupported format, or corrupted PDF",
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
                            "Unprocessable entity - PDF is valid but contains no JavaScript code",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "500",
                    description =
                            "Internal server error - Unexpected error during JavaScript extraction",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface JavaScriptResponse {}
