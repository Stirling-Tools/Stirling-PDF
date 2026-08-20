package stirling.software.SPDF.config;

import java.util.Locale;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

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
