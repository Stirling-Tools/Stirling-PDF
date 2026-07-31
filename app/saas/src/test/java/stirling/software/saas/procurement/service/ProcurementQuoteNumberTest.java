package stirling.software.saas.procurement.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The quote reference is printed on the quote, carried onto the Stripe quote and invoice, and cited
 * by the signed agreement. It replaced a random-token scheme that could collide, so the property
 * that matters is uniqueness by construction — not merely that the format looks right.
 */
class ProcurementQuoteNumberTest {

    @Test
    @DisplayName("reads as a reference: zero-padded deal, then revision")
    void formatsPredictably() {
        assertThat(ProcurementService.quoteNumber(42L, 1L)).isEqualTo("QT-00042-01");
        assertThat(ProcurementService.quoteNumber(1L, 1L)).isEqualTo("QT-00001-01");
        assertThat(ProcurementService.quoteNumber(7L, 12L)).isEqualTo("QT-00007-12");
    }

    @Test
    @DisplayName("two deals never share a reference, however many quotes each has")
    void isUniqueAcrossDealsAndRevisions() {
        Set<String> seen = new HashSet<>();
        for (long dealId = 1; dealId <= 400; dealId++) {
            for (long revision = 1; revision <= 5; revision++) {
                assertThat(seen.add(ProcurementService.quoteNumber(dealId, revision)))
                        .as("duplicate reference for deal %d revision %d", dealId, revision)
                        .isTrue();
            }
        }
        assertThat(seen).hasSize(2000);
    }

    @Test
    @DisplayName("outgrows its padding rather than truncating into a collision")
    void survivesIdsWiderThanThePadding() {
        // Padding is presentation only: a wider deal id or revision must still produce a distinct
        // reference, which a fixed-width truncation would not.
        assertThat(ProcurementService.quoteNumber(1_234_567L, 1L)).isEqualTo("QT-1234567-01");
        assertThat(ProcurementService.quoteNumber(42L, 123L)).isEqualTo("QT-00042-123");
        assertThat(ProcurementService.quoteNumber(1L, 1L))
                .isNotEqualTo(ProcurementService.quoteNumber(11L, 1L));
    }
}
