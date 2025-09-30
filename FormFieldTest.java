import stirling.software.common.util.FormUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import java.io.File;

public class FormFieldTest {
    public static void main(String[] args) {
        try {
            // Create a simple test to see what the backend actually returns
            ObjectMapper mapper = new ObjectMapper();

            // Test with an empty document (this should return empty fields)
            PDDocument emptyDoc = new PDDocument();
            FormUtils.FormFieldExtraction extraction = FormUtils.extractFieldsWithTemplate(emptyDoc);

            System.out.println("Empty document extraction:");
            System.out.println("Fields: " + extraction.fields().size());
            System.out.println("Template: " + extraction.template());
            System.out.println("JSON: " + mapper.writeValueAsString(extraction));

            emptyDoc.close();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
