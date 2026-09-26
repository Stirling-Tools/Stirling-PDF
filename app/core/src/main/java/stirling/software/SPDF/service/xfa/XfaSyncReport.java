package stirling.software.SPDF.service.xfa;

import java.util.List;
import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What applying an {@link XfaMode} did to a document: the fate of the XFA packet and, for a sync,
 * one entry per AcroForm field in field-tree order. Values of password and signature fields are
 * never included.
 */
public record XfaSyncReport(
        XfaMode mode,
        XfaInspection.State state,
        Action action,
        boolean usageRightsRemoved,
        Counts counts,
        List<FieldResult> fields,
        List<String> warnings) {

    public enum Action {
        NOT_XFA,
        UNTOUCHED,
        SYNCED,
        STRIPPED,
        /** Removed because the operation changed the form's structure, not at the caller's ask. */
        STRIPPED_STRUCTURAL,
        /** Already gone: PDFBox drops the XFA packet whenever it flattens a hybrid form. */
        REMOVED_BY_FLATTEN;

        @JsonValue
        public String json() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    public enum Status {
        UNCHANGED,
        UPDATED,
        CREATED,
        /**
         * Several AcroForm fields share one XFA data node with different values; one value won and
         * was copied to the other fields.
         */
        CONFLICT_RESOLVED,
        /** The template binds the field to no data ({@code bind match="none"}). */
        UNBOUND,
        NOT_FOUND,
        SKIPPED_TYPE,
        /**
         * A numeric, date or picture-formatted field nobody edited: its AcroForm value is display
         * text, and writing it over the stored value would corrupt that value.
         */
        SKIPPED_FORMATTED;

        @JsonValue
        public String json() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    public enum Note {
        /** Radio state {@code /n} was read as the n-th choice of the exclusion group. */
        POSITIONAL,
        /** The AcroForm export values disagree with the template; the template won. */
        MISMATCH,
        /** Matched by name because the template could not place the field. */
        FALLBACK,
        /** Acrobat recalculates this field when it opens the form. */
        CALCULATED,
        /** A multi-selection list, stored one value per line. */
        APPROXIMATE,
        /** The template binds the field through a SOM expression this sync cannot follow. */
        UNSUPPORTED_REF;

        @JsonValue
        public String json() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /**
     * @param xfaPath where the value lives under {@code xfa:data}, dot separated
     * @param acroForm the field's AcroForm value in the form the XFA data stores it, which for a
     *     checkbox or radio group is its XFA on or off value
     * @param before the XFA value before the sync; null when the data node did not exist
     * @param after the XFA value after the sync; equal to {@code before} when nothing was written
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FieldResult(
            String name,
            String xfaPath,
            String kind,
            String acroForm,
            String before,
            String after,
            Status status,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) List<Note> notes) {}

    public record Counts(
            int updated,
            int created,
            int unchanged,
            int conflicts,
            int unbound,
            int notFound,
            int skipped) {

        static Counts of(List<FieldResult> fields) {
            int updated = 0;
            int created = 0;
            int unchanged = 0;
            int conflicts = 0;
            int unbound = 0;
            int notFound = 0;
            int skipped = 0;
            for (FieldResult field : fields) {
                switch (field.status()) {
                    case UPDATED -> updated++;
                    case CREATED -> created++;
                    case UNCHANGED -> unchanged++;
                    case CONFLICT_RESOLVED -> conflicts++;
                    case UNBOUND -> unbound++;
                    case NOT_FOUND -> notFound++;
                    case SKIPPED_TYPE, SKIPPED_FORMATTED -> skipped++;
                }
            }
            return new Counts(updated, created, unchanged, conflicts, unbound, notFound, skipped);
        }
    }

    /** The report without its field list, small enough to travel in a response header. */
    public record Summary(
            XfaMode mode,
            XfaInspection.State state,
            Action action,
            boolean usageRightsRemoved,
            Counts counts,
            int warnings) {}

    public Summary summary() {
        return new Summary(mode, state, action, usageRightsRemoved, counts, warnings.size());
    }

    static XfaSyncReport of(
            XfaMode mode,
            XfaInspection.State state,
            Action action,
            boolean usageRightsRemoved,
            List<FieldResult> fields,
            List<String> warnings) {
        return new XfaSyncReport(
                mode,
                state,
                action,
                usageRightsRemoved,
                Counts.of(fields),
                List.copyOf(fields),
                List.copyOf(warnings));
    }

    static XfaSyncReport notXfa(XfaMode mode) {
        return of(mode, XfaInspection.State.NONE, Action.NOT_XFA, false, List.of(), List.of());
    }
}
