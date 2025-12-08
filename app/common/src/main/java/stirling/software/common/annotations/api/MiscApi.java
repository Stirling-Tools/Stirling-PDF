package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Miscellaneous API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/misc"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/misc")
@Tag(
        name = "Misc",
        description =
                """
                Tools that don't fit neatly elsewhere: OCR, compress, repair, flatten, extract images, update metadata, add stamps/page numbers/images, and more.
                These endpoints help fix problem PDFs and prepare them for sharing, storage, or further processing.

                Typical uses:
                • Repair a damaged PDF or remove blank pages
                • Run OCR on scanned PDFs so they become searchable
                • Compress large PDFs for email or web download
                • Extract embedded images or scans
                • Add page numbers, stamps, or overlay an image (e.g. logo, seal)
                • Update PDF metadata (title, author, etc.)
                """)
public @interface MiscApi {}
