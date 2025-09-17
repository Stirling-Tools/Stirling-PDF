package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Proprietary UI Data API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/proprietary/ui-data"), and OpenAPI @Tag. Note:
 * Controllers using this annotation should also add @EnterpriseEndpoint.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/proprietary/ui-data")
@Tag(name = "Proprietary UI Data", description = "APIs for React UI data (Enterprise features)")
public @interface ProprietaryUiDataApi {}
