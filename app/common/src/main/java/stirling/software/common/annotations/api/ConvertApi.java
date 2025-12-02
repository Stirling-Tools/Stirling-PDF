package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Convert API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/convert"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/convert")
@Tag(
        name = "Convert",
        description =
                """
                Convert PDFs to and from other formats (Word, images, HTML, Markdown, PDF/A, CBZ/CBR, EML, etc.).
                This group also powers the text-editor / jobId-based editing flow for incremental PDF edits.

                Typical uses:
                • Turn PDFs into Word or text for editing
                • Convert office files, images, HTML, or email (EML) into PDFs
                • Create PDF/A for long-term archiving
                • Export PDFs as images, HTML, CSV, or Markdown for search, analysis, or reuse
                """)
public @interface ConvertApi {}
