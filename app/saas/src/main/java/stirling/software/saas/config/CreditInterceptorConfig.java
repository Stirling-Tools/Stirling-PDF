package stirling.software.saas.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.interceptor.UnifiedCreditInterceptor;

@Configuration
@Profile("saas")
@RequiredArgsConstructor
public class CreditInterceptorConfig implements WebMvcConfigurer {

    private final UnifiedCreditInterceptor unifiedCreditInterceptor;
    private final CreditsProperties creditsProperties;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (creditsProperties.isEnabled()) {
            registry.addInterceptor(unifiedCreditInterceptor)
                    .addPathPatterns("/api/**")
                    .excludePathPatterns(
                            "/api/v1/credits/**", "/api/v1/config/**", "/api/v1/info/**");
        }
    }
}
