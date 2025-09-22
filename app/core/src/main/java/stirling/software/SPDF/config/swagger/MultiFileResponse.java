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
 * API response annotation for operations that may return multiple files or a ZIP archive. Use for
 * operations like PDF to images, split PDF, or multiple file conversions.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description =
                            "Files processed successfully. Returns single file or ZIP archive containing multiple files.",
                    content = {
                        @Content(
                                mediaType = "application/pdf",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description = "Single PDF file result")),
                        @Content(
                                mediaType = "application/zip",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description =
                                                        "ZIP archive containing multiple output files")),
                        @Content(
                                mediaType = "image/png",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description = "Single image file (PNG)")),
                        @Content(
                                mediaType = "image/jpeg",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description = "Single image file (JPEG)"))
                    }),
            @ApiResponse(
                    responseCode = "400",
                    description = "Invalid PDF file or request parameters",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "500",
                    description = "Internal server error during processing",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface MultiFileResponse {}
