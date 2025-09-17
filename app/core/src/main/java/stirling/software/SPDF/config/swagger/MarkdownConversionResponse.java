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
 * API response annotation for PDF to Markdown conversions. Use for endpoints that convert PDF to
 * Markdown format.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "PDF converted successfully to Markdown format",
                    content =
                            @Content(
                                    mediaType = "text/markdown",
                                    schema =
                                            @Schema(
                                                    type = "string",
                                                    format = "binary",
                                                    description =
                                                            "Markdown file converted from PDF")))
        })
public @interface MarkdownConversionResponse {}
