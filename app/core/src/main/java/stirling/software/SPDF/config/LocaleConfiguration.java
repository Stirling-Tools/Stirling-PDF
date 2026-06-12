package stirling.software.SPDF.config;

import java.util.Locale;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

// TODO: Migration required - this class was a Spring MVC WebMvcConfigurer. Quarkus/JAX-RS has no
// WebMvcConfigurer, InterceptorRegistry, LocaleChangeInterceptor or SessionLocaleResolver.
// The locale-resolution logic (computing the default Locale from configuration) is preserved below
// as a CDI-produced Locale. The two pieces of behavior that previously came from the MVC machinery
// still need to be wired up by collaborators:
//   1. The "lang" request-param locale switching (old LocaleChangeInterceptor) must be implemented
//      as a jakarta.ws.rs.container.ContainerRequestFilter that reads the "lang" query/form param
//      and applies it for the request scope.
//   2. CleanUrlInterceptor (its own assigned file) must be converted to a ContainerRequestFilter
//      and registered automatically via @Provider; it no longer needs explicit registration here.
@ApplicationScoped
@RequiredArgsConstructor
public class LocaleConfiguration {

    private final ApplicationProperties applicationProperties;

    /**
     * Produces the application default {@link Locale}, derived from the configured
     * SYSTEM_DEFAULTLOCALE value. Replaces the old SessionLocaleResolver default-locale wiring.
     */
    @jakarta.enterprise.inject.Produces
    @ApplicationScoped
    public Locale defaultLocale() {
        String appLocaleEnv = applicationProperties.getSystem().getDefaultLocale();
        Locale defaultLocale = // Fallback to US locale if environment variable is not set
                Locale.US;
        if (appLocaleEnv != null && !appLocaleEnv.isEmpty()) {
            Locale tempLocale = Locale.forLanguageTag(appLocaleEnv);
            String tempLanguageTag = tempLocale.toLanguageTag();
            if (appLocaleEnv.equalsIgnoreCase(tempLanguageTag)) {
                defaultLocale = tempLocale;
            } else {
                tempLocale = Locale.forLanguageTag(appLocaleEnv.replace("_", "-"));
                tempLanguageTag = tempLocale.toLanguageTag();
                if (appLocaleEnv.equalsIgnoreCase(tempLanguageTag)) {
                    defaultLocale = tempLocale;
                } else {
                    System.err.println(
                            "Invalid SYSTEM_DEFAULTLOCALE environment variable value. Falling back to default en-US.");
                }
            }
        }
        return defaultLocale;
    }
}
