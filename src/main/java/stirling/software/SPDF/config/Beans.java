package stirling.software.SPDF.config;

import java.time.Duration;
import java.util.Locale;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.i18n.LocaleChangeInterceptor;
import org.springframework.web.servlet.i18n.SessionLocaleResolver;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.Refill;

@Configuration
public class Beans implements WebMvcConfigurer {

	@Bean
	public Bucket createRateLimitBucket() {
	    Refill refill = Refill.of(1000, Duration.ofDays(1));
	    Bandwidth limit = Bandwidth.classic(1000, refill).withInitialTokens(1000);
	    return Bucket4j.builder().addLimit(limit).build();
	}

	
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
                tempLocale = Locale.forLanguageTag(appLocaleEnv.replace("_","-"));
                tempLanguageTag = tempLocale.toLanguageTag();

                if (appLocaleEnv.equalsIgnoreCase(tempLanguageTag)) {
                    defaultLocale = tempLocale;
                } else {
                    System.err.println("Invalid APP_LOCALE environment variable value. Falling back to default Locale.UK.");
                }
            }
        }

        slr.setDefaultLocale(defaultLocale);
        return slr;
    }
    
}
