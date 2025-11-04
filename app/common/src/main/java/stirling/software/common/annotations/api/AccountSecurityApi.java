package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Account Security API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/account"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/account")
@Tag(
        name = "Account Security",
        description =
                """
                Account security and protection services for user safety and organizational compliance.

                This endpoint group provides account security capabilities for organizations requiring
                enhanced protection against unauthorized access, security threats, and compliance violations.

                Common use cases:
                • Corporate security policy compliance and SOX, HIPAA, GDPR requirements
                • Fraud prevention, identity theft protection, and account compromise recovery
                • Multi-factor authentication implementation and insider threat mitigation
                • Account recovery and emergency access procedures

                Business applications:
                • Enterprise risk management, security governance, and customer trust protection
                • Legal liability reduction and insurance requirement fulfillment
                • Audit preparation, compliance reporting, and business continuity management

                Operational scenarios:
                • Security incident response, forensic investigation, and user training
                • Emergency account lockdown, suspicious activity monitoring, and compliance documentation

                Target users: Security administrators, compliance officers, and organizations
                prioritizing account security and regulatory compliance.
                """)
public @interface AccountSecurityApi {}
