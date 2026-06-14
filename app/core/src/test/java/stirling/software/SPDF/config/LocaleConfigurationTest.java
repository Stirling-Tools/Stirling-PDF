package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Locale;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

/**
 * MIGRATION: LocaleConfiguration was a Spring MVC {@code WebMvcConfigurer} exposing {@code
 * localeChangeInterceptor()} and {@code localeResolver()} (SessionLocaleResolver). Quarkus/JAX-RS
 * has no WebMvcConfigurer, LocaleChangeInterceptor or SessionLocaleResolver, so those beans are
 * gone. The default-locale resolution logic is preserved as a CDI-produced {@link Locale} via
 * {@link LocaleConfiguration#defaultLocale()}; these tests now exercise that producer directly.
 */
class LocaleConfigurationTest {

    @Test
    void defaultLocaleFallsBackToUSWhenNoLocaleConfigured() {
        LocaleConfiguration config = createConfig(null);
        assertEquals(Locale.US, config.defaultLocale());
    }

    @Test
    void defaultLocaleFallsBackToUSWhenEmptyLocale() {
        LocaleConfiguration config = createConfig("");
        assertEquals(Locale.US, config.defaultLocale());
    }

    @Test
    void defaultLocaleAcceptsValidLocale() {
        LocaleConfiguration config = createConfig("de-DE");
        Locale resolved = config.defaultLocale();
        assertNotNull(resolved);
        assertEquals("de-DE", resolved.toLanguageTag());
    }

    @Test
    void defaultLocaleHandlesUnderscoreLocale() {
        // The configured value is compared (case-insensitively) against the resolved language tag.
        // An underscore form like "fr_FR" never equals the hyphenated tag "fr-FR" under
        // equalsIgnoreCase ('_' != '-'), so it falls back to US rather than throwing.
        LocaleConfiguration config = createConfig("fr_FR");
        Locale resolved = config.defaultLocale();
        assertNotNull(resolved);
        assertEquals(Locale.US, resolved);
    }

    @Test
    void defaultLocaleFallsBackForInvalidLocale() {
        // An invalid tag that doesn't round-trip falls back to US.
        LocaleConfiguration config = createConfig("invalid!!locale");
        assertEquals(Locale.US, config.defaultLocale());
    }

    @Test
    void defaultLocaleIsNotNull() {
        LocaleConfiguration config = createConfig("en-US");
        assertNotNull(config.defaultLocale());
    }

    @Test
    void defaultLocaleHandlesJapaneseLocale() {
        LocaleConfiguration config = createConfig("ja-JP");
        Locale resolved = config.defaultLocale();
        assertNotNull(resolved);
        assertEquals("ja-JP", resolved.toLanguageTag());
    }

    private LocaleConfiguration createConfig(String locale) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.System system = new ApplicationProperties.System();
        system.setDefaultLocale(locale);
        props.setSystem(system);
        return new LocaleConfiguration(props);
    }
}
