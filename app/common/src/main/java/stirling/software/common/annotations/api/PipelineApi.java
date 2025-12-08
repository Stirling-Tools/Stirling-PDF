package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Pipeline API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/pipeline"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/pipeline")
@Tag(
        name = "Pipeline",
        description =
                """
                Run several PDF operations in one configured pipeline instead of calling multiple endpoints yourself.
                Useful when you always do the same steps in sequence (for example: convert → OCR → compress → watermark).

                Typical uses:
                • Process incoming invoices in one go (clean, OCR, compress, stamp, etc.)
                • Normalise documents before they enter an archive
                • Wrap a complex document flow behind a single API call for your own apps
                """)
public @interface PipelineApi {}
