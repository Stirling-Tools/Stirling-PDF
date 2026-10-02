package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

/**
 * The public contract: nothing the store serves to an anonymous or non-teammate caller carries a
 * publisher identity. Serialises the real DTOs and looks for the keys that must be absent, not
 * null.
 */
class StoreDtoPrivacyTest {

    private static final List<String> FORBIDDEN =
            List.of(
                    "publisher",
                    "publisherTeamId",
                    "publishedBy",
                    "publishedByUserId",
                    "userId",
                    "teamId",
                    "email",
                    "username",
                    "owner",
                    "@");

    private final ObjectMapper mapper = new ObjectMapper();

    private static StoreDtos.ListingSummary summary() {
        return new StoreDtos.ListingSummary(
                "sp-8k2m4q7x",
                "invoice-intake-cleanup",
                "Invoice intake cleanup",
                "Makes scanned invoices searchable.",
                "ingestion",
                "route",
                List.of("/api/v1/misc/ocr-pdf"),
                128,
                1240,
                "2026-09-01T10:00:00Z",
                false,
                false,
                null);
    }

    private static StoreDtos.ListingDetail detail(StoreDtos.Viewer viewer) {
        return new StoreDtos.ListingDetail(
                "sp-8k2m4q7x",
                "invoice-intake-cleanup",
                "Invoice intake cleanup",
                "Makes scanned invoices searchable.",
                "ingestion",
                "route",
                List.of("/api/v1/misc/ocr-pdf"),
                128,
                1240,
                "2026-09-01T10:00:00Z",
                false,
                false,
                viewer == null ? null : viewer.starred(),
                "2026-07-01T10:00:00Z",
                "Added a watermark step.",
                List.of(new StoreManifest.Step("/api/v1/misc/ocr-pdf", Map.of("languages", "eng"))),
                List.of(StoreManifest.RequiredOnInstall.source()),
                null,
                viewer);
    }

    @Test
    void publicPayloadsCarryNoIdentity() {
        String page =
                mapper.writeValueAsString(new StoreDtos.ListPage(List.of(summary()), null, 1));
        String anonymousDetail = mapper.writeValueAsString(detail(null));
        String strangerDetail =
                mapper.writeValueAsString(detail(new StoreDtos.Viewer(true, false, null)));
        for (String json : List.of(page, anonymousDetail, strangerDetail)) {
            for (String key : FORBIDDEN) {
                assertThat(json).as(key).doesNotContain("\"" + key);
            }
            assertThat(json).doesNotContain("@");
            assertThat(json).doesNotContain("displayName");
        }
    }

    @Test
    void teammatesSeeTheAuthorOnlyInsideViewer() {
        String json =
                mapper.writeValueAsString(
                        detail(new StoreDtos.Viewer(false, true, new StoreDtos.Author("Connor"))));
        assertThat(json).contains("\"viewer\":{");
        assertThat(json).contains("\"author\":{\"displayName\":\"Connor\"}");
        assertThat(json.indexOf("displayName")).isGreaterThan(json.indexOf("\"viewer\""));
    }

    @Test
    void findingSeverityIsLowerCaseOnTheWire() {
        String json =
                mapper.writeValueAsString(
                        StoreFinding.block("no-steps", "t", "d", StoreFinding.Where.details()));
        assertThat(json).contains("\"severity\":\"block\"");
        assertThat(json).contains("\"kind\":\"details\"");
    }

    @Test
    void storeIdsAreWellFormedAndSlugsAreSafe() {
        for (int i = 0; i < 50; i++) {
            assertThat(StoreIds.isStoreId(StoreIds.newStoreId())).isTrue();
        }
        assertThat(StoreIds.isStoreId("sp-8k2m4q7x")).isTrue();
        assertThat(StoreIds.isStoreId("sp-8k2m4q7u")).isFalse();
        assertThat(StoreIds.slugify("Invoice intake cleanup")).isEqualTo("invoice-intake-cleanup");
        assertThat(StoreIds.slugify("  Ops: GDPR / export pack!  "))
                .isEqualTo("ops-gdpr-export-pack");
        assertThat(StoreIds.slugify("")).isEqualTo("pipeline");
    }
}
