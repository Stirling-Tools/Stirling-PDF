package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Security API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/security"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/security")
@Tag(
        name = "Security",
        description =
                """
                Protect and clean PDFs: passwords, digital signatures, redaction, and sanitizing.
                These endpoints help you control who can open a file, what they can do with it, and remove sensitive content when needed.

                Typical uses:
                • Add or remove a password on a PDF
                • Redact personal or confidential information (manually or automatically)
                • Validate or remove digital signatures
                • Sanitize a PDF to strip scripts and embedded content
                """)
public @interface SecurityApi {}
