package stirling.software.SPDF.config;

import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;

import io.quarkus.arc.lookup.LookupIfProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

/**
 * Produces the {@link TelegramBotsApi} bean. The original Spring class was a {@code @Configuration}
 * guarded by {@code @ConditionalOnProperty(prefix = "telegram", name = "enabled", havingValue =
 * "true")}. In Quarkus the equivalent runtime guard is {@link LookupIfProperty} on the producer, so
 * the bean is only resolvable when {@code telegram.enabled=true}.
 */
@ApplicationScoped
public class TelegramBotConfig {

    @Produces
    @ApplicationScoped
    @LookupIfProperty(name = "telegram.enabled", stringValue = "true")
    public TelegramBotsApi telegramBotsApi() throws TelegramApiException {
        return new TelegramBotsApi(DefaultBotSession.class);
    }
}
