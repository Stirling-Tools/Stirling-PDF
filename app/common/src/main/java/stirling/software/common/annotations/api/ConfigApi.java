package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Configuration API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/config"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/config")
@Tag(
        name = "Config",
        description =
                """
                System configuration management for deployment optimization and operational control.

                This endpoint group provides system configuration capabilities for organizations
                deploying and operating Stirling PDF in various environments.

                Common use cases:
                • Environment-specific deployment and performance tuning for varying workloads
                • Resource optimization, cost management, and infrastructure integration
                • Compliance configuration, disaster recovery, and multi-environment standardization

                Business applications:
                • Operational cost optimization, SLA compliance, and risk management
                • Vendor integration, change management, and capacity planning

                Operational scenarios:
                • System deployment, performance troubleshooting, and emergency changes
                • Planned maintenance and multi-site deployment coordination

                Target users: System administrators, DevOps engineers, and IT operations teams
                responsible for deployment configuration and system optimization.
                """)
public @interface ConfigApi {}
