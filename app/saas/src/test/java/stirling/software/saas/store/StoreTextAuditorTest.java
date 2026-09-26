package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

/** The text audit never echoes a blocked word and catches the usual dodges. */
class StoreTextAuditorTest {

    private static final String GOOD_DESCRIPTION =
            "Makes scanned supplier invoices searchable, strips scripts, then shrinks them.";

    private final StoreTextAuditor auditor =
            new StoreTextAuditor(BlockedWordList.of(List.of("zorblax"), List.of("zorblaxia")));

    private static PublishRequest request(String name, String description) {
        return new PublishRequest("p1", name, description, "ingestion", null);
    }

    private List<String> codes(String name, String description) {
        return auditor.audit(request(name, description), false).stream()
                .map(StoreFinding::code)
                .toList();
    }

    @Test
    void cleanTextPasses() {
        assertThat(codes("Invoice intake cleanup", GOOD_DESCRIPTION)).isEmpty();
    }

    @Test
    void lengthLimits() {
        assertThat(codes("Hi", GOOD_DESCRIPTION)).contains("text-too-short");
        assertThat(codes("Invoice intake", "Too short.")).contains("text-too-short");
        assertThat(codes("x".repeat(81), GOOD_DESCRIPTION)).contains("text-too-long");
    }

    @Test
    void markupEmailsAddressesAndInternalHostsBlock() {
        assertThat(codes("Invoice <b>intake</b>", GOOD_DESCRIPTION)).contains("markup");
        assertThat(codes("Invoice intake", GOOD_DESCRIPTION + " Ask ops@example.com."))
                .contains("email-in-text");
        assertThat(codes("Invoice intake", GOOD_DESCRIPTION + " Runs on 10.0.4.12."))
                .contains("address-in-text");
        assertThat(codes("Invoice intake", GOOD_DESCRIPTION + " Sends to claims-dms.internal."))
                .contains("private-host-in-text");
    }

    @Test
    void publicLinksOnlyWarn() {
        List<StoreFinding> findings =
                auditor.audit(
                        request(
                                "Invoice intake",
                                GOOD_DESCRIPTION + " See https://example.com/docs."),
                        false);
        assertThat(findings)
                .singleElement()
                .satisfies(
                        f -> {
                            assertThat(f.code()).isEqualTo("url-in-text");
                            assertThat(f.severity()).isEqualTo(StoreFinding.Severity.WARN);
                        });
    }

    @Test
    void blockedWordsAreCaughtThroughLeetAndPunctuationAndNeverEchoed() {
        for (String variant :
                List.of("zorblax", "ZORBLAX", "z0rbl4x", "z.o.r.b.l.a.x", "zorrrblax")) {
            List<StoreFinding> findings =
                    auditor.audit(
                            request("Invoice intake", GOOD_DESCRIPTION + " Also " + variant + "."),
                            false);
            assertThat(findings)
                    .as(variant)
                    .extracting(StoreFinding::code)
                    .contains("blocked-word");
            assertThat(findings)
                    .as(variant)
                    .allSatisfy(
                            f -> {
                                assertThat(f.title()).doesNotContainIgnoringCase("zorblax");
                                assertThat(f.detail()).doesNotContainIgnoringCase("zorblax");
                            });
        }
    }

    @Test
    void allowListedTokensAndSubstringsDoNotMatch() {
        assertThat(codes("Invoice intake", GOOD_DESCRIPTION + " Made in zorblaxia.")).isEmpty();
        assertThat(codes("Invoice intake", GOOD_DESCRIPTION + " The zorblaxes are fine."))
                .isEmpty();
    }

    @Test
    void reservedWordsInNamesBlockUnlessCurated() {
        assertThat(codes("Stirling official cleanup", GOOD_DESCRIPTION)).contains("reserved-word");
        assertThat(auditor.audit(request("Stirling official cleanup", GOOD_DESCRIPTION), true))
                .extracting(StoreFinding::code)
                .doesNotContain("reserved-word");
        assertThat(codes("Invoice intake", GOOD_DESCRIPTION + " Not verified by anyone."))
                .doesNotContain("reserved-word");
    }

    @Test
    void unreadableTextBlocksAndInvisibleCharactersAreStripped() {
        assertThat(codes("!!!! #### $$$$ %%%%", GOOD_DESCRIPTION)).contains("unreadable");
        assertThat(StoreTextAuditor.clean("Inv​oice  intake‮")).isEqualTo("Invoice intake");
    }
}
