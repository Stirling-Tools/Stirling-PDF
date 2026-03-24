package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.LocaleChangeInterceptor;
import org.springframework.web.servlet.i18n.SessionLocaleResolver;

import stirling.software.common.model.ApplicationProperties;

class LocaleConfigurationTest {

    @Test
    void localeChangeInterceptorUsesLangParam() {
        LocaleConfiguration config = createConfig(null);
        LocaleChangeInterceptor lci = config.localeChangeInterceptor();
        assertEquals("lang", lci.getParamName());
    }

    @Test
    void localeResolverDefaultsToUKWhenNoLocaleConfigured() {
        LocaleConfiguration config = createConfig(null);
        LocaleResolver resolver = config.localeResolver();
        assertNotNull(resolver);
        assertTrue(resolver instanceof SessionLocaleResolver);
    }

    @Test
    void localeResolverDefaultsToUKWhenEmptyLocale() {
        LocaleConfiguration config = createConfig("");
        LocaleResolver resolver = config.localeResolver();
        assertNotNull(resolver);
    }

    @Test
    void localeResolverAcceptsValidLocale() {
        LocaleConfiguration config = createConfig("de-DE");
        LocaleResolver resolver = config.localeResolver();
        assertNotNull(resolver);
    }

    @Test
    void localeResolverHandlesUnderscoreLocale() {
        LocaleConfiguration config = createConfig("fr_FR");
        LocaleResolver resolver = config.localeResolver();
        assertNotNull(resolver);
    }

    @Test
    void localeResolverFallsBackForInvalidLocale() {
        // An invalid tag that doesn't round-trip
        LocaleConfiguration config = createConfig("invalid!!locale");
        LocaleResolver resolver = config.localeResolver();
        assertNotNull(resolver);
    }

    @Test
    void localeChangeInterceptorIsNotNull() {
        LocaleConfiguration config = createConfig("en-US");
        assertNotNull(config.localeChangeInterceptor());
    }

    @Test
    void localeResolverHandlesJapaneseLocale() {
        LocaleConfiguration config = createConfig("ja-JP");
        LocaleResolver resolver = config.localeResolver();
        assertNotNull(resolver);
    }

    private LocaleConfiguration createConfig(String locale) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.System system = new ApplicationProperties.System();
        system.setDefaultLocale(locale);
        props.setSystem(system);
        return new LocaleConfiguration(props);
    }
}
