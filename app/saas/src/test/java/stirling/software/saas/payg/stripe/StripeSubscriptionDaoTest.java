package stirling.software.saas.payg.stripe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import stirling.software.saas.payg.stripe.StripeSubscriptionDao.PriceRate;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.SubscriptionBilling;

/**
 * Pure-Mockito tests for {@link StripeSubscriptionDao}. The {@link JdbcTemplate} is mocked; the
 * {@link RowMapper} passed to {@code query} is captured and invoked against a mocked {@link
 * ResultSet} so the epoch→{@code LocalDateTime} conversion and rate-extraction branches are
 * exercised directly without a real Postgres {@code stripe} schema.
 */
@ExtendWith(MockitoExtension.class)
class StripeSubscriptionDaoTest {

    @Mock private JdbcTemplate jdbcTemplate;

    private StripeSubscriptionDao dao() {
        return new StripeSubscriptionDao(jdbcTemplate);
    }

    @Test
    @DisplayName("constructor rejects a null JdbcTemplate")
    void constructor_rejectsNull() {
        assertThatThrownBy(() -> new StripeSubscriptionDao(null))
                .isInstanceOf(NullPointerException.class);
    }

    @Nested
    @DisplayName("findBilling")
    class FindBilling {

        @Test
        @DisplayName("returns empty for null / blank subscription id without touching the DB")
        void blankId_shortCircuits() {
            assertThat(dao().findBilling(null)).isEmpty();
            assertThat(dao().findBilling("")).isEmpty();
            assertThat(dao().findBilling("   ")).isEmpty();
            verifyNoInteractions(jdbcTemplate);
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("maps a populated row, converting epoch seconds to local time")
        void mapsPopulatedRow() throws Exception {
            long start = 1_700_000_000L;
            long end = 1_702_000_000L;
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("current_period_start")).thenReturn(start);
            when(rs.getLong("current_period_end")).thenReturn(end);
            // wasNull() is consulted right after each getLong: start, end → both present.
            when(rs.wasNull()).thenReturn(false, false);
            when(rs.getString("price_id")).thenReturn("price_1");
            when(rs.getString("status")).thenReturn("active");
            when(rs.getString("currency")).thenReturn("usd");
            // extractRate prefers unit_amount_decimal.
            when(rs.getString("unit_amount_decimal")).thenReturn("12.5");

            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("sub_1")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<SubscriptionBilling> m = inv.getArgument(1);
                                return List.of(m.mapRow(rs, 0));
                            });

            Optional<SubscriptionBilling> out = dao().findBilling("sub_1");

            assertThat(out).isPresent();
            SubscriptionBilling b = out.get();
            assertThat(b.priceId()).isEqualTo("price_1");
            assertThat(b.status()).isEqualTo("active");
            assertThat(b.currency()).isEqualTo("usd");
            assertThat(b.perDocMinor()).isEqualByComparingTo("12.5");
            assertThat(b.periodStart())
                    .isEqualTo(
                            LocalDateTime.ofInstant(
                                    Instant.ofEpochSecond(start), ZoneId.systemDefault()));
            assertThat(b.periodEnd())
                    .isEqualTo(
                            LocalDateTime.ofInstant(
                                    Instant.ofEpochSecond(end), ZoneId.systemDefault()));
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("row with a null period boundary maps to null and is filtered out")
        void nullPeriod_mapsToNull_filteredOut() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("current_period_start")).thenReturn(0L);
            when(rs.getLong("current_period_end")).thenReturn(0L);
            // start present, end null → returns null from the mapper.
            when(rs.wasNull()).thenReturn(false, true);

            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("sub_2")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<SubscriptionBilling> m = inv.getArgument(1);
                                java.util.List<SubscriptionBilling> rows =
                                        new java.util.ArrayList<>();
                                rows.add(m.mapRow(rs, 0));
                                return rows;
                            });

            assertThat(dao().findBilling("sub_2")).isEmpty();
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("DataAccessException (missing schema) degrades to empty")
        void dataAccessException_degradesToEmpty() {
            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("sub_3")))
                    .thenThrow(new EmptyResultDataAccessException(1));

            assertThat(dao().findBilling("sub_3")).isEmpty();
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("passes the subscription id through as the bind parameter")
        void bindsSubscriptionId() {
            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("sub_bind")))
                    .thenReturn(List.of());

            assertThat(dao().findBilling("sub_bind")).isEmpty();

            // The subscription id is passed as the (single) bind parameter.
            org.mockito.Mockito.verify(jdbcTemplate)
                    .query(anyString(), any(RowMapper.class), eq("sub_bind"));
        }
    }

    @Nested
    @DisplayName("findRateByLookupKey")
    class FindRateByLookupKey {

        @Test
        @DisplayName("returns empty for blank lookupKey or currency without touching the DB")
        void blankArgs_shortCircuit() {
            assertThat(dao().findRateByLookupKey(null, "usd")).isEmpty();
            assertThat(dao().findRateByLookupKey("  ", "usd")).isEmpty();
            assertThat(dao().findRateByLookupKey("plan:processor", null)).isEmpty();
            assertThat(dao().findRateByLookupKey("plan:processor", " ")).isEmpty();
            verifyNoInteractions(jdbcTemplate);
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("maps a usable rate row and lower-cases the currency bind param")
        void mapsRow_lowerCasesCurrency() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("unit_amount_decimal")).thenReturn(null);
            when(rs.getLong("unit_amount")).thenReturn(99L);
            when(rs.wasNull()).thenReturn(false);
            when(rs.getString("price_id")).thenReturn("price_x");
            when(rs.getString("currency")).thenReturn("usd");

            // Two bind params: lookupKey and the lower-cased currency. Match each vararg element.
            when(jdbcTemplate.query(
                            anyString(), any(RowMapper.class), eq("plan:processor"), eq("usd")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<PriceRate> m = inv.getArgument(1);
                                return List.of(m.mapRow(rs, 0));
                            });

            Optional<PriceRate> out = dao().findRateByLookupKey("plan:processor", "USD");

            assertThat(out).isPresent();
            assertThat(out.get().priceId()).isEqualTo("price_x");
            assertThat(out.get().currency()).isEqualTo("usd");
            assertThat(out.get().perDocMinor()).isEqualByComparingTo("99");

            // Verifies the "USD" input was lower-cased to "usd" before binding.
            org.mockito.Mockito.verify(jdbcTemplate)
                    .query(anyString(), any(RowMapper.class), eq("plan:processor"), eq("usd"));
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("row with no usable amount maps to null and yields empty")
        void unusableRate_filteredOut() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("unit_amount_decimal")).thenReturn(null);
            when(rs.getLong("unit_amount")).thenReturn(0L);
            when(rs.wasNull()).thenReturn(true); // unit_amount is SQL NULL → rate null

            when(jdbcTemplate.query(
                            anyString(), any(RowMapper.class), eq("plan:processor"), eq("usd")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<PriceRate> m = inv.getArgument(1);
                                java.util.List<PriceRate> rows = new java.util.ArrayList<>();
                                rows.add(m.mapRow(rs, 0));
                                return rows;
                            });

            assertThat(dao().findRateByLookupKey("plan:processor", "usd")).isEmpty();
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("DataAccessException degrades to empty")
        void dataAccessException_degradesToEmpty() {
            when(jdbcTemplate.query(
                            anyString(), any(RowMapper.class), eq("plan:processor"), eq("usd")))
                    .thenThrow(new EmptyResultDataAccessException(1));

            assertThat(dao().findRateByLookupKey("plan:processor", "usd")).isEmpty();
        }
    }

    @Nested
    @DisplayName("extractRate branches via the billing mapper")
    class ExtractRate {

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("blank decimal then valid integer unit_amount yields integer rate")
        void blankDecimal_fallsBackToInteger() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("current_period_start")).thenReturn(1L);
            when(rs.getLong("current_period_end")).thenReturn(2L);
            when(rs.getString("price_id")).thenReturn("p");
            when(rs.getString("status")).thenReturn("active");
            when(rs.getString("currency")).thenReturn("usd");
            when(rs.getString("unit_amount_decimal")).thenReturn("   "); // blank → ignored
            when(rs.getLong("unit_amount")).thenReturn(42L);
            // wasNull order: start(false), end(false), unit_amount(false).
            when(rs.wasNull()).thenReturn(false, false, false);

            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("s")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<SubscriptionBilling> m = inv.getArgument(1);
                                return List.of(m.mapRow(rs, 0));
                            });

            assertThat(dao().findBilling("s").orElseThrow().perDocMinor())
                    .isEqualByComparingTo("42");
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("unparseable decimal falls back to integer unit_amount")
        void unparseableDecimal_fallsBackToInteger() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("current_period_start")).thenReturn(1L);
            when(rs.getLong("current_period_end")).thenReturn(2L);
            when(rs.getString("price_id")).thenReturn("p");
            when(rs.getString("status")).thenReturn("active");
            when(rs.getString("currency")).thenReturn("usd");
            when(rs.getString("unit_amount_decimal")).thenReturn("not-a-number");
            when(rs.getLong("unit_amount")).thenReturn(7L);
            when(rs.wasNull()).thenReturn(false, false, false);

            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("s")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<SubscriptionBilling> m = inv.getArgument(1);
                                return List.of(m.mapRow(rs, 0));
                            });

            assertThat(dao().findBilling("s").orElseThrow().perDocMinor())
                    .isEqualByComparingTo("7");
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("zero / negative rate is normalised to null")
        void nonPositiveRate_isNull() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("current_period_start")).thenReturn(1L);
            when(rs.getLong("current_period_end")).thenReturn(2L);
            when(rs.getString("price_id")).thenReturn("p");
            when(rs.getString("status")).thenReturn("active");
            when(rs.getString("currency")).thenReturn("usd");
            when(rs.getString("unit_amount_decimal")).thenReturn("-3");
            when(rs.wasNull()).thenReturn(false, false);

            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("s")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<SubscriptionBilling> m = inv.getArgument(1);
                                return List.of(m.mapRow(rs, 0));
                            });

            assertThat(dao().findBilling("s").orElseThrow().perDocMinor()).isNull();
        }

        @Test
        @SuppressWarnings("unchecked")
        @DisplayName("null decimal and null unit_amount yields a null rate")
        void allNull_yieldsNullRate() throws Exception {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("current_period_start")).thenReturn(1L);
            when(rs.getLong("current_period_end")).thenReturn(2L);
            when(rs.getString("price_id")).thenReturn("p");
            when(rs.getString("status")).thenReturn("active");
            when(rs.getString("currency")).thenReturn("usd");
            when(rs.getString("unit_amount_decimal")).thenReturn(null);
            when(rs.getLong("unit_amount")).thenReturn(0L);
            // start(false), end(false), unit_amount(true → SQL NULL).
            when(rs.wasNull()).thenReturn(false, false, true);

            when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq("s")))
                    .thenAnswer(
                            inv -> {
                                RowMapper<SubscriptionBilling> m = inv.getArgument(1);
                                return List.of(m.mapRow(rs, 0));
                            });

            assertThat(dao().findBilling("s").orElseThrow().perDocMinor()).isNull();
        }
    }
}
