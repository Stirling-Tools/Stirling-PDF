package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Admin Server Certificate API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/admin/server-certificate"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/admin/server-certificate")
@Tag(
        name = "Admin - Server Certificate",
        description =
                """
                Server certificate management for secure enterprise deployments and encrypted communications.

                This endpoint group provides certificate lifecycle management for organizations
                requiring secure communications in document processing infrastructure.

                Common use cases:
                • Corporate security compliance and encrypted communications for healthcare/finance
                • Customer data protection, internal audits, and multi-environment standardization
                • Third-party security assessments and disaster recovery security measures

                Business applications:
                • Enterprise security governance, client trust protection, and secure B2B exchange
                • Legal requirement fulfillment, liability reduction, and M&A security preparation

                Operational scenarios:
                • Certificate renewal, emergency replacement, and security incident response
                • Multi-site deployment coordination and cloud migration preparation

                Target users: Security administrators, compliance officers, and IT infrastructure
                teams requiring enterprise-grade security for document processing systems.
                """)
public @interface AdminServerCertificateApi {}
