package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@Configuration
public class OpenApiConfig {

	@Bean
	public OpenAPI customOpenAPI() {
	    String version = getClass().getPackage().getImplementationVersion();
	    if (version == null) {
	        
	            version = "1.0.0"; // default version if all else fails
	        
	    }

	    return new OpenAPI().components(new Components()).info(
	            new Info().title("Stirling PDF API").version(version).description("API documentation for all Server-Side processing.\nPlease note some functionality might be UI only and missing from here."));
	}


}
