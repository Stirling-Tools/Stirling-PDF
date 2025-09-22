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
 * API response annotation for PDF to plain text conversions. Use for endpoints that extract text
 * content from PDF.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "PDF text extracted successfully",
                    content = {
                        @Content(
                                mediaType = "text/plain",
                                schema =
                                        @Schema(
                                                type = "string",
                                                description =
                                                        "Plain text content extracted from PDF")),
                        @Content(
                                mediaType = "application/rtf",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description = "Rich Text Format document"))
                    }),
            @ApiResponse(
                    responseCode = "400",
                    description = "Bad request - Invalid input parameters or corrupted PDF",
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
                    description = "Unprocessable entity - PDF is valid but text extraction failed",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "500",
                    description = "Internal server error - Unexpected error during text extraction",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface TextPlainConversionResponse {}
