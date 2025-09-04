package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.Reader;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Arrays;

import org.junit.jupiter.api.Test;

public class InputStreamTemplateResourceTest {

    @Test
    void gettersReturnProvidedFields() {
        byte[] data = {1, 2, 3};
        InputStream is = new ByteArrayInputStream(data);
        String encoding = "UTF-8";
        InputStreamTemplateResource resource = new InputStreamTemplateResource(is, encoding);

        assertSame(is, resource.getInputStream());
        assertEquals(encoding, resource.getCharacterEncoding());
    }

    @Test
    void fieldsAreFinal() throws NoSuchFieldException {
        Field inputStreamField = InputStreamTemplateResource.class.getDeclaredField("inputStream");
        Field characterEncodingField =
                InputStreamTemplateResource.class.getDeclaredField("characterEncoding");

        assertTrue(Modifier.isFinal(inputStreamField.getModifiers()));
        assertTrue(Modifier.isFinal(characterEncodingField.getModifiers()));
    }

    @Test
    void noSetterMethodsPresent() {
        long setterCount =
                Arrays.stream(InputStreamTemplateResource.class.getDeclaredMethods())
                        .filter(method -> method.getName().startsWith("set"))
                        .count();

        assertEquals(0, setterCount, "InputStreamTemplateResource should not have setter methods");
    }

    @Test
    void readerReturnsCorrectContent() throws Exception {
        String content = "Hello, world!";
        InputStream is = new ByteArrayInputStream(content.getBytes("UTF-8"));
        InputStreamTemplateResource resource = new InputStreamTemplateResource(is, "UTF-8");

        try (Reader reader = resource.reader()) {
            char[] buffer = new char[content.length()];
            int read = reader.read(buffer);
            assertEquals(content.length(), read);
            assertEquals(content, new String(buffer));
        }
    }

    @Test
    void relativeThrowsUnsupportedOperationException() {
        InputStream is = new ByteArrayInputStream(new byte[0]);
        InputStreamTemplateResource resource = new InputStreamTemplateResource(is, "UTF-8");
        assertThrows(UnsupportedOperationException.class, () -> resource.relative("other"));
    }

    @Test
    void getDescriptionReturnsExpectedString() {
        InputStream is = new ByteArrayInputStream(new byte[0]);
        InputStreamTemplateResource resource = new InputStreamTemplateResource(is, "UTF-8");
        assertEquals("InputStream resource [Stream]", resource.getDescription());
    }

    @Test
    void getBaseNameReturnsExpectedString() {
        InputStream is = new ByteArrayInputStream(new byte[0]);
        InputStreamTemplateResource resource = new InputStreamTemplateResource(is, "UTF-8");
        assertEquals("streamResource", resource.getBaseName());
    }

    @Test
    void existsReturnsTrueWhenInputStreamNotNull() {
        InputStream is = new ByteArrayInputStream(new byte[0]);
        InputStreamTemplateResource resource = new InputStreamTemplateResource(is, "UTF-8");
        assertTrue(resource.exists());
    }

    @Test
    void existsReturnsFalseWhenInputStreamIsNull() {
        InputStreamTemplateResource resource = new InputStreamTemplateResource(null, "UTF-8");
        assertFalse(resource.exists());
    }
}
