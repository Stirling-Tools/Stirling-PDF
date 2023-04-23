package stirling.software.SPDF.config;

import java.util.Locale;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.i18n.LocaleChangeInterceptor;
import org.springframework.web.servlet.i18n.SessionLocaleResolver;

@Configuration
public class Beans implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(localeChangeInterceptor());
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

        String appLocaleEnv = System.getProperty("APP_LOCALE");
        if (appLocaleEnv == null)
            appLocaleEnv = System.getenv("APP_LOCALE");
        Locale defaultLocale = Locale.UK; // Fallback to UK locale if environment variable is not set

        if (appLocaleEnv != null && !appLocaleEnv.isEmpty()) {
            Locale tempLocale = Locale.forLanguageTag(appLocaleEnv);
            String tempLanguageTag = tempLocale.toLanguageTag();

            if (appLocaleEnv.equalsIgnoreCase(tempLanguageTag)) {
                defaultLocale = tempLocale;
            } else {
                System.err.println("Invalid APP_LOCALE environment variable value. Falling back to default Locale.UK.");
            }
        }

        slr.setDefaultLocale(defaultLocale);
        return slr;
    }

}
