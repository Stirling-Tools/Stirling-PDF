package stirling.software.SPDF.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final EndpointInterceptor endpointInterceptor;

    public WebMvcConfig(EndpointInterceptor endpointInterceptor) {
        this.endpointInterceptor = endpointInterceptor;
    }

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
}
