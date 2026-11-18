package stirling.software.saas.store.moderation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.store.StoreFinding;

/**
 * The store's multilingual content check: listing text through a hosted moderation model, after the
 * local word list has passed it. A flagged field is a block naming the field and the category,
 * never the words.
 *
 * <p>When the provider cannot answer, publishing goes ahead on the word list alone: the listing is
 * public and removable, so an outage should not stop every publish. Verdicts are cached by text for
 * a few minutes, so the preflight and the publish that follows it cost one call.
 */
@Slf4j
public class StoreContentCheck {

    private static final int CACHE_SIZE = 512;
    private static final long CACHE_MILLIS = 10 * 60 * 1000L;

    /** One piece of listing text and the label the findings use for it. */
    public record Field(String label, String text) {}

    private record Cached(StoreModeration.Verdict verdict, long at) {}

    private final StoreModeration provider;
    private final Map<String, Cached> cache =
            new LinkedHashMap<>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
                    return size() > CACHE_SIZE;
                }
            };

    public StoreContentCheck(StoreModeration provider) {
        this.provider = provider;
    }

    /** No hosted check: the word list is the only text check. */
    public static StoreContentCheck disabled() {
        return new StoreContentCheck(null);
    }

    public boolean enabled() {
        return provider != null;
    }

    public List<StoreFinding> audit(List<Field> fields) {
        List<Field> present =
                fields.stream().filter(f -> f.text() != null && !f.text().isBlank()).toList();
        if (provider == null || present.isEmpty()) {
            return List.of();
        }
        List<StoreModeration.Verdict> verdicts;
        try {
            verdicts = verdicts(present.stream().map(Field::text).toList());
        } catch (StoreModeration.UnavailableException e) {
            log.warn(
                    "Store content check unavailable ({}), publishing on the word list alone: {}",
                    provider.name(),
                    e.getMessage());
            return List.of();
        }
        List<StoreFinding> findings = new ArrayList<>();
        for (int i = 0; i < present.size(); i++) {
            StoreModeration.Verdict verdict = verdicts.get(i);
            if (!verdict.flagged()) {
                continue;
            }
            String why =
                    verdict.category() == null
                            ? "The store's content check flagged it."
                            : "The store's content check flagged it as " + verdict.category() + ".";
            findings.add(
                    StoreFinding.block(
                            "content-flagged",
                            present.get(i).label() + " was flagged by the content check",
                            why + " Reword it, then run the checks again.",
                            StoreFinding.Where.details()));
        }
        return findings;
    }

    /** Cached verdicts where fresh, one provider call for the rest. */
    private List<StoreModeration.Verdict> verdicts(List<String> texts)
            throws StoreModeration.UnavailableException {
        long now = System.currentTimeMillis();
        StoreModeration.Verdict[] out = new StoreModeration.Verdict[texts.size()];
        List<Integer> missing = new ArrayList<>();
        synchronized (cache) {
            for (int i = 0; i < texts.size(); i++) {
                Cached hit = cache.get(texts.get(i));
                if (hit != null && now - hit.at() < CACHE_MILLIS) {
                    out[i] = hit.verdict();
                } else {
                    missing.add(i);
                }
            }
        }
        if (!missing.isEmpty()) {
            List<StoreModeration.Verdict> fresh =
                    provider.check(missing.stream().map(texts::get).toList());
            synchronized (cache) {
                for (int j = 0; j < missing.size(); j++) {
                    int i = missing.get(j);
                    out[i] = fresh.get(j);
                    cache.put(texts.get(i), new Cached(fresh.get(j), now));
                }
            }
        }
        return List.of(out);
    }

    /**
     * A provider's category name in plain words: "self-harm" and "SelfHarm" both read "self harm".
     */
    public static String plainCategory(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.replaceAll("(?<=[a-z])(?=[A-Z])", " ")
                .replace('-', ' ')
                .replace('_', ' ')
                .toLowerCase(Locale.ROOT)
                .trim();
    }
}
