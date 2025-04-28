package stirling.software.SPDF.config;

import java.util.Locale;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.i18n.LocaleChangeInterceptor;
import org.springframework.web.servlet.i18n.SessionLocaleResolver;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@RequiredArgsConstructor
public class LocaleConfiguration implements WebMvcConfigurer {

    private final ApplicationProperties applicationProperties;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(localeChangeInterceptor());
        registry.addInterceptor(new CleanUrlInterceptor());
    }

    @Bean
    public LocaleChangeInterceptor localeChangeInterceptor() {
        LocaleChangeInterceptor lci = new LocaleChangeInterceptor();
        lci.setParamName("lang");
        return lci;
    }

    @Bean
    public LocaleResolver localeResolver() {
        SessionLocaleResolver slr = new SessionLocaleResolver();
        String appLocaleEnv = applicationProperties.getSystem().getDefaultLocale();
        Locale defaultLocale = // Fallback to UK locale if environment variable is not set
                Locale.UK;
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
                            "Invalid SYSTEM_DEFAULTLOCALE environment variable value. Falling back to default en-GB.");
                }
            }
        }
        slr.setDefaultLocale(defaultLocale);
        return slr;
    }
}
