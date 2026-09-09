package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.general.EditTextOperation;

@DisplayName("EditTextRequest")
class EditTextRequestTest {

    private static EditTextOperation op(String find, String replace) {
        EditTextOperation operation = new EditTextOperation();
        operation.setFind(find);
        operation.setReplace(replace);
        return operation;
    }

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("edits and wholeWordSearch are null on a fresh instance")
        void defaultValues() {
            EditTextRequest req = new EditTextRequest();

            assertThat(req.getEdits()).isNull();
            assertThat(req.getWholeWordSearch()).isNull();
            assertThat(req.getPageNumbers()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("setters round-trip every field including inherited pageNumbers")
        void setters() {
            EditTextRequest req = new EditTextRequest();
            List<EditTextOperation> edits = List.of(op("foo", "bar"));
            req.setEdits(edits);
            req.setWholeWordSearch(true);
            req.setPageNumbers("1-3");

            assertThat(req.getEdits()).isSameAs(edits);
            assertThat(req.getWholeWordSearch()).isTrue();
            assertThat(req.getPageNumbers()).isEqualTo("1-3");
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class Equality {

        @Test
        @DisplayName("equal instances are equal and share a hashCode")
        void equalInstances() {
            EditTextRequest a = new EditTextRequest();
            a.setEdits(List.of(op("foo", "bar")));
            a.setWholeWordSearch(true);
            EditTextRequest b = new EditTextRequest();
            b.setEdits(List.of(op("foo", "bar")));
            b.setWholeWordSearch(true);

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differing subclass field breaks equality")
        void notEqual() {
            EditTextRequest a = new EditTextRequest();
            a.setWholeWordSearch(false);
            EditTextRequest b = new EditTextRequest();
            b.setWholeWordSearch(true);

            assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains a representative field value")
        void toStringContent() {
            EditTextRequest req = new EditTextRequest();
            req.setWholeWordSearch(true);

            assertThat(req.toString()).isNotNull().contains("wholeWordSearch=true");
        }
    }
}
