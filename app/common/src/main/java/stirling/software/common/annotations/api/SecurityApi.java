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
                Document security and protection services for confidential and sensitive content.

                This endpoint group provides essential security operations for organizations handling
                sensitive documents and materials requiring controlled access.

                Common use cases:
                • Legal confidentiality, healthcare privacy (HIPAA), and financial regulatory compliance
                • Government classified handling, corporate IP protection, and educational privacy (FERPA)
                • Contract security for business transactions

                Business applications:
                • Document authentication, confidential sharing, and secure archiving
                • Content watermarking, access control, and privacy protection through redaction

                Industry scenarios:
                • Legal discovery, medical records exchange, financial audit documentation
                • Enterprise policy enforcement and data governance

                Target users: Legal professionals, healthcare administrators, compliance officers,
                government agencies, and enterprises handling sensitive content.
                """)
public @interface SecurityApi {}
