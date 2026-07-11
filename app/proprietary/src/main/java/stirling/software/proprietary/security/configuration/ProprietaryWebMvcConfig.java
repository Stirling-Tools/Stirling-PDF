package stirling.software.proprietary.security.configuration;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.filter.ApiKeyProcessingScopeInterceptor;
import stirling.software.proprietary.security.filter.ParticipantRateLimitInterceptor;

@Configuration
@RequiredArgsConstructor
public class ProprietaryWebMvcConfig implements WebMvcConfigurer {

    private final ParticipantRateLimitInterceptor participantRateLimitInterceptor;
    private final ApiKeyProcessingScopeInterceptor apiKeyProcessingScopeInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(participantRateLimitInterceptor)
                .addPathPatterns("/api/v1/workflow/participant/**");
        // Confine processing-only (and every shared team) API key to the file/PDF endpoints.
        registry.addInterceptor(apiKeyProcessingScopeInterceptor).addPathPatterns("/api/**");
    }
}
