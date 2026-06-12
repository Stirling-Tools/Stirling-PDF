package stirling.software.saas.config;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.interceptor.UnifiedCreditInterceptor;

// TODO: Migration required - interceptor registration moved to @Provider JAX-RS filters
@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
public class CreditInterceptorConfig {

    private final UnifiedCreditInterceptor unifiedCreditInterceptor;
    private final CreditsProperties creditsProperties;
}
