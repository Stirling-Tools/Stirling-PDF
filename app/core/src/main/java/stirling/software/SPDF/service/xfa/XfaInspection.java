package stirling.software.SPDF.service.xfa;

import java.util.Locale;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * A document's XFA as it was before an operation touched it. It has to be taken first: flattening
 * deletes the XFA packet, and the AcroForm values captured here are what separate a field the
 * caller edited from one it left alone.
 *
 * @param valuesBefore AcroForm field state keyed by fully qualified name, in the form {@link
 *     XfaFieldValues#snapshot} produces; empty unless {@code state} is {@link State#HYBRID}
 */
public record XfaInspection(
        State state, boolean usageRights, boolean certified, Map<String, String> valuesBefore) {

    public enum State {
        /** No XFA packet: nothing in this package touches the document. */
        NONE,
        /** AcroForm fields plus an XFA packet describing the same form, as LiveCycle saves it. */
        HYBRID,
        /**
         * XFA only (or marked NeedsRendering): there are no AcroForm fields to take values from.
         */
        DYNAMIC;

        @JsonValue
        public String json() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    static final XfaInspection NOT_XFA = new XfaInspection(State.NONE, false, false, Map.of());

    public boolean hasXfa() {
        return state != State.NONE;
    }
}
