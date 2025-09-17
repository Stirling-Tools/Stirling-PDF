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
 * Standard API response annotation for PDF operations that take PDF input and return PDF output.
 * Use for single PDF input → single PDF output (SISO) operations like rotate, compress, etc.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "PDF processed successfully",
                    content =
                            @Content(
                                    mediaType = "application/pdf",
                                    schema =
                                            @Schema(
                                                    type = "string",
                                                    format = "binary",
                                                    description = "The processed PDF file"))),
            @ApiResponse(
                    responseCode = "400",
                    description =
                            "Bad request - Invalid input parameters, unsupported file format, or corrupted PDF",
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
                            "Unprocessable entity - PDF is valid but cannot be processed (e.g., encrypted, corrupted)",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "500",
                    description = "Internal server error - Unexpected error during PDF processing",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface StandardPdfResponse {}
