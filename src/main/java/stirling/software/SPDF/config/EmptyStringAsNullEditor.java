package stirling.software.SPDF.config;
import java.beans.PropertyEditorSupport;

public class EmptyStringAsNullEditor extends PropertyEditorSupport {
    @Override
    public void setAsText(String text) {
        if (text != null && text.trim().isEmpty()) {
            setValue(null);
        } else {
            setValue(text);
        }
    }
}
