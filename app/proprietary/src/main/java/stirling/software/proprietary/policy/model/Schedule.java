package stirling.software.proprietary.policy.model;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.EnumSet;
import java.util.Set;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * A scheduled policy's firing cadence; {@code type} is the JSON discriminator. Wall-clock kinds
 * ({@link Daily}, {@link Weekly}, {@link Monthly}) evaluate in the {@code after} argument's zone;
 * {@link Every} is a fixed offset and ignores wall-clock time.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = Schedule.Every.class, name = "every"),
    @JsonSubTypes.Type(value = Schedule.Daily.class, name = "daily"),
    @JsonSubTypes.Type(value = Schedule.Weekly.class, name = "weekly"),
    @JsonSubTypes.Type(value = Schedule.Monthly.class, name = "monthly"),
})
@JsonIgnoreProperties(ignoreUnknown = true)
public sealed interface Schedule {

    /** The next firing strictly after {@code after}, evaluated in {@code after}'s zone. */
    ZonedDateTime nextAfter(ZonedDateTime after);

    /** The granularities a fixed-interval schedule can repeat on. */
    enum Unit {
        MINUTES,
        HOURS,
        DAYS
    }

    /** A fixed offset from {@code after}: "every 15 minutes", "every 6 hours". No time of day. */
    record Every(long count, Unit unit) implements Schedule {
        public Every {
            if (count <= 0) {
                throw new IllegalArgumentException("'every' schedule needs a positive count");
            }
            if (unit == null) {
                throw new IllegalArgumentException("'every' schedule needs a unit");
            }
        }

        @Override
        public ZonedDateTime nextAfter(ZonedDateTime after) {
            return switch (unit) {
                case MINUTES -> after.plusMinutes(count);
                case HOURS -> after.plusHours(count);
                case DAYS -> after.plusDays(count);
            };
        }
    }

    /** Once a day at a wall-clock time: "every day at 02:00". */
    record Daily(LocalTime at) implements Schedule {
        public Daily {
            requireTime(at);
        }

        @Override
        public ZonedDateTime nextAfter(ZonedDateTime after) {
            ZonedDateTime today = after.with(at);
            return today.isAfter(after) ? today : today.plusDays(1);
        }
    }

    /** On chosen weekdays at a wall-clock time: "every Monday and Thursday at 09:00". */
    record Weekly(Set<DayOfWeek> days, LocalTime at) implements Schedule {
        public Weekly {
            if (days == null || days.isEmpty()) {
                throw new IllegalArgumentException("'weekly' schedule needs at least one day");
            }
            requireTime(at);
            days = EnumSet.copyOf(days);
        }

        @Override
        public ZonedDateTime nextAfter(ZonedDateTime after) {
            // Soonest of the next 7 days landing on a chosen weekday, at the configured time.
            for (int i = 0; i <= 7; i++) {
                ZonedDateTime candidate = after.plusDays(i).with(at);
                if (candidate.isAfter(after) && days.contains(candidate.getDayOfWeek())) {
                    return candidate;
                }
            }
            throw new IllegalStateException("unreachable: a chosen weekday recurs within 8 days");
        }
    }

    /**
     * On a day of the month at a wall-clock time: "the 1st at 00:00". Months too short for the
     * chosen day (e.g. the 31st in February) are skipped, not clamped.
     */
    record Monthly(int dayOfMonth, LocalTime at) implements Schedule {
        public Monthly {
            if (dayOfMonth < 1 || dayOfMonth > 31) {
                throw new IllegalArgumentException("'monthly' day-of-month must be 1-31");
            }
            requireTime(at);
        }

        @Override
        public ZonedDateTime nextAfter(ZonedDateTime after) {
            ZonedDateTime firstOfMonth = after.withDayOfMonth(1).with(at);
            // Scan forward a few years' worth of months to skip ones without the chosen day.
            for (int i = 0; i < 48; i++) {
                ZonedDateTime month = firstOfMonth.plusMonths(i);
                if (month.toLocalDate().lengthOfMonth() >= dayOfMonth) {
                    ZonedDateTime fire = month.withDayOfMonth(dayOfMonth);
                    if (fire.isAfter(after)) {
                        return fire;
                    }
                }
            }
            throw new IllegalStateException(
                    "unreachable: a month with the chosen day recurs yearly");
        }
    }

    private static void requireTime(LocalTime at) {
        if (at == null) {
            throw new IllegalArgumentException("schedule needs a time of day ('at')");
        }
    }
}
