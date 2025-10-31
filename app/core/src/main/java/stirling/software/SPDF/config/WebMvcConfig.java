package stirling.software.SPDF.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final EndpointInterceptor endpointInterceptor;
    private final ApplicationProperties applicationProperties;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(endpointInterceptor);
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
