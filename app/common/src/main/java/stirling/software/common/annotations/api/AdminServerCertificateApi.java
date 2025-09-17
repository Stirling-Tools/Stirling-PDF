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
        description = "Admin APIs for server certificate management")
public @interface AdminServerCertificateApi {}
