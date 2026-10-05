package stirling.software.saas.store.moderation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.saas.store.StoreFinding;

/** Flagged fields block by name, an outage follows the fail policy, and verdicts are reused. */
class StoreContentCheckTest {

    /** Flags any text containing "nasty"; counts the texts it was asked about. */
    private static final class FakeModeration implements StoreModeration {
        final List<String> asked = new ArrayList<>();
        boolean down;

        @Override
        public List<Verdict> check(List<String> texts) throws UnavailableException {
            if (down) {
                throw new UnavailableException("down");
            }
            asked.addAll(texts);
            return texts.stream()
                    .map(t -> t.contains("nasty") ? new Verdict(true, "harassment") : Verdict.CLEAN)
                    .toList();
        }

        @Override
        public String name() {
            return "fake";
        }
    }

    private static List<StoreContentCheck.Field> fields(String name, String description) {
        return List.of(
                new StoreContentCheck.Field("Name", name),
                new StoreContentCheck.Field("Description", description),
                new StoreContentCheck.Field("What changed", null));
    }

    @Test
    void aFlaggedFieldBlocksByNameAndNeverEchoesTheText() {
        StoreContentCheck check = new StoreContentCheck(new FakeModeration(), false);

        List<StoreFinding> findings =
                check.audit(fields("Invoice intake", "A nasty description of the pipeline"));

        assertThat(findings)
                .singleElement()
                .satisfies(
                        f -> {
                            assertThat(f.code()).isEqualTo("content-flagged");
                            assertThat(f.title())
                                    .isEqualTo("Description was flagged by the content check");
                            assertThat(f.detail()).contains("harassment").doesNotContain("nasty");
                            assertThat(f.blocks()).isTrue();
                        });
    }

    @Test
    void cleanTextPassesAndBlankFieldsAreNotSent() {
        FakeModeration provider = new FakeModeration();
        StoreContentCheck check = new StoreContentCheck(provider, false);

        assertThat(check.audit(fields("Invoice intake", "Makes invoices searchable"))).isEmpty();
        assertThat(provider.asked).containsExactly("Invoice intake", "Makes invoices searchable");
    }

    @Test
    void anOutageFallsBackToTheWordListUnlessFailClosed() {
        FakeModeration provider = new FakeModeration();
        provider.down = true;

        assertThat(new StoreContentCheck(provider, false).audit(fields("A", "B"))).isEmpty();
        assertThat(new StoreContentCheck(provider, true).audit(fields("A", "B")))
                .extracting(StoreFinding::code)
                .containsExactly("content-check-unavailable");
    }

    @Test
    void thePublishAfterAPreflightReusesItsVerdicts() {
        FakeModeration provider = new FakeModeration();
        StoreContentCheck check = new StoreContentCheck(provider, false);

        check.audit(fields("Invoice intake", "Makes invoices searchable"));
        check.audit(fields("Invoice intake", "Makes invoices searchable and small"));

        assertThat(provider.asked)
                .containsExactly(
                        "Invoice intake",
                        "Makes invoices searchable",
                        "Makes invoices searchable and small");
    }

    @Test
    void disabledChecksNothing() {
        assertThat(StoreContentCheck.disabled().audit(fields("nasty", "nasty"))).isEmpty();
        assertThat(StoreContentCheck.disabled().enabled()).isFalse();
    }

    @Test
    void categoriesReadAsPlainWords() {
        assertThat(StoreContentCheck.plainCategory("self-harm")).isEqualTo("self harm");
        assertThat(StoreContentCheck.plainCategory("SelfHarm")).isEqualTo("self harm");
        assertThat(StoreContentCheck.plainCategory("Hate")).isEqualTo("hate");
    }
}
