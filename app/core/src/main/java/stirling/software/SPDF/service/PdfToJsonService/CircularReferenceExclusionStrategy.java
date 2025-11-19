package stirling.software.SPDF.service.PdfToJsonService;


import com.google.gson.ExclusionStrategy;
import com.google.gson.FieldAttributes;

public class CircularReferenceExclusionStrategy implements ExclusionStrategy {
    @Override
    public boolean shouldSkipField(FieldAttributes fieldAttributes) {
        // Skip parent field and other transient fields to break circular references
        return "parent".equals(fieldAttributes.getName()) ||
                "isHeader".equals(fieldAttributes.getName()) ||
                "headerSize".equals(fieldAttributes.getName()) ||
                "isRootTag".equals(fieldAttributes.getName()) ||
                "largestHeader".equals(fieldAttributes.getName()) ||
                "dropTagList".equals(fieldAttributes.getName()) ||
                "inList".equals(fieldAttributes.getName()) ||
                "rootHeader".equals(fieldAttributes.getName());
    }

    @Override
    public boolean shouldSkipClass(Class<?> aClass) {
        return false;
    }
}
