package stirling.software.SPDF.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
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
    public void addCorsMappings(CorsRegistry registry) {
        // Allow frontend dev server (Vite on localhost:5173) to access backend
        registry.addMapping("/**")
                .allowedOrigins("http://localhost:5173", "http://127.0.0.1:5173")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }

    // @Override
    // public void addResourceHandlers(ResourceHandlerRegistry registry) {
    //     // Handler for external static resources - DISABLED in backend-only mode
    //     registry.addResourceHandler("/**")
    //             .addResourceLocations(
    //                     "file:" + InstallationPathConfig.getStaticPath(), "classpath:/static/");
    //     // .setCachePeriod(0); // Optional: disable caching
    // }
}
