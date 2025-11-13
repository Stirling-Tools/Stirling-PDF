package stirling.software.proprietary.service.chatbot;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.chatbot.ChatbotUsageSummary;
import stirling.software.proprietary.service.chatbot.ChatbotFeatureProperties.ChatbotSettings;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatbotUsageService {

    private final ChatbotFeatureProperties featureProperties;

    private final Map<String, UsageWindow> usageByUser = new ConcurrentHashMap<>();

    public ChatbotUsageSummary registerIngestion(String userId, long estimatedTokens) {
        return incrementUsage(userId, Math.max(estimatedTokens, 0L));
    }

    public ChatbotUsageSummary registerGeneration(
            String userId, long promptTokens, long completionTokens) {
        long total = Math.max(promptTokens + completionTokens, 0L);
        return incrementUsage(userId, total);
    }

    public ChatbotUsageSummary currentUsage(String userId) {
        String key = normalizeUserId(userId);
        UsageWindow window = usageByUser.get(key);
        if (window == null) {
            return buildSummary(key, 0L, 0L);
        }
        return buildSummary(key, window.tokens.get(), 0L);
    }

    private ChatbotUsageSummary incrementUsage(String userId, long deltaTokens) {
        String key = normalizeUserId(userId);
        YearMonth now = YearMonth.now(ZoneOffset.UTC);
        UsageWindow window =
                usageByUser.compute(
                        key,
                        (ignored, existing) -> {
                            if (existing == null || !existing.window.equals(now)) {
                                existing = new UsageWindow(now);
                            }
                            if (deltaTokens > 0) {
                                existing.tokens.addAndGet(deltaTokens);
                            }
                            return existing;
                        });
        return buildSummary(key, window.tokens.get(), deltaTokens);
    }

    private ChatbotUsageSummary buildSummary(String userKey, long consumed, long deltaTokens) {
        ChatbotSettings settings = featureProperties.current();
        long allocation = Math.max(settings.usage().perUserMonthlyTokens(), 1L);
        double ratio = allocation == 0 ? 1.0 : (double) consumed / allocation;
        long remaining = Math.max(allocation - consumed, 0L);
        boolean limitExceeded = consumed > allocation;
        boolean nearingLimit = ratio >= settings.usage().warnAtRatio();
        return ChatbotUsageSummary.builder()
                .allocatedTokens(allocation)
                .consumedTokens(consumed)
                .remainingTokens(remaining)
                .usageRatio(Math.min(ratio, 1.0))
                .nearingLimit(nearingLimit)
                .limitExceeded(limitExceeded)
                .lastIncrementTokens(deltaTokens)
                .window(currentWindowDescription(userKey))
                .build();
    }

    private String currentWindowDescription(String userKey) {
        UsageWindow window = usageByUser.get(userKey);
        if (window == null) {
            return YearMonth.now(ZoneOffset.UTC).toString();
        }
        return window.window.toString();
    }

    private String normalizeUserId(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "anonymous";
        }
        return userId.trim().toLowerCase();
    }

    private static final class UsageWindow {
        private final YearMonth window;
        private final AtomicLong tokens = new AtomicLong();

        private UsageWindow(YearMonth window) {
            this.window = window;
        }
    }
}
