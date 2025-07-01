package stirling.software.SPDF.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final EndpointInterceptor endpointInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(endpointInterceptor);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Handler for external static resources
        registry.addResourceHandler("/**")
                .addResourceLocations(
                        "file:" + InstallationPathConfig.getStaticPath(), "classpath:/static/");
        // .setCachePeriod(0); // Optional: disable caching
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))) {
            registry.addMapping("/**")
                    .allowedOrigins("http://localhost:5173", "http://tauri.localhost")
                    .allowedMethods("*")
                    .allowedHeaders("*");
        }
    }
}
