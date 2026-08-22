package stirling.software.proprietary.model;

import java.io.Serializable;
import java.util.List;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One UTC day's tally of an ordered sequence of tools applied to a single document. Where {@link
 * ToolUsageStat} only remembers the step before, this remembers the whole path a document took, so
 * a repeated end-to-end workflow ("compress, then watermark, then add a password") is visible as
 * one recurring chain rather than a scatter of pairs.
 *
 * <p>Chains are recorded as prefixes: a document that reaches step three has also been counted at
 * steps one and two, so {@code count} reads as "documents that got at least this far".
 */
@Entity
@Table(
        name = "tool_chain_stats",
        indexes = {
            @Index(name = "idx_tool_chain_day", columnList = "epoch_day"),
            @Index(name = "idx_tool_chain_principal_day", columnList = "principal, epoch_day"),
            @Index(name = "idx_tool_chain_length_day", columnList = "chain_length, epoch_day")
        })
@IdClass(ToolChainStatId.class)
@Getter
@Setter
@NoArgsConstructor
public class ToolChainStat implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Cannot occur inside a tool key, which is restricted to letters, digits, {@code _} and -. */
    public static final String SEPARATOR = ">";

    /** Bounds the primary key; longer chains are recorded as their trailing window. */
    public static final int MAX_CHAIN_TOOLS = 8;

    /**
     * Sized for {@link #MAX_CHAIN_TOOLS} keys at the 64-character validation limit, so a chain that
     * passes validation can always be stored. Real tool keys top out around 20 characters, so a
     * full-length chain is nearer 160. Tool keys are restricted to ASCII, so this is also the byte
     * length - the composite key stays far inside Postgres's index-entry limit.
     */
    public static final int MAX_CHAIN_KEY_LENGTH = 520;

    @Id
    @Column(name = "principal", length = 255)
    private String principal;

    /** The ordered tool keys joined by {@link #SEPARATOR}, oldest step first. */
    @Id
    @Column(name = "chain_key", length = MAX_CHAIN_KEY_LENGTH)
    private String chainKey;

    @Id
    @Column(name = "epoch_day")
    private long epochDay;

    /**
     * Denormalised so "chains of at least N steps" is an indexed read rather than a string scan.
     */
    @Column(name = "chain_length")
    private int chainLength;

    @Column(name = "count")
    private long count;

    public ToolChainStat(
            String principal, String chainKey, long epochDay, int chainLength, long count) {
        this.principal = principal;
        this.chainKey = chainKey;
        this.epochDay = epochDay;
        this.chainLength = chainLength;
        this.count = count;
    }

    public static String toChainKey(List<String> tools) {
        return String.join(SEPARATOR, tools);
    }

    public static List<String> fromChainKey(String chainKey) {
        return chainKey == null || chainKey.isEmpty()
                ? List.of()
                : List.of(chainKey.split(SEPARATOR));
    }
}
