package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSBoolean;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.service.PdfJsonCosMapper.SerializationContext;

/** Unit tests for {@link PdfJsonCosMapper}. */
class PdfJsonCosMapperTest {

    private PdfJsonCosMapper mapper;
    private PDDocument document;

    @BeforeEach
    void setUp() {
        mapper = new PdfJsonCosMapper();
        document = new PDDocument();
    }

    @AfterEach
    void tearDown() throws IOException {
        if (document != null) {
            document.close();
        }
    }

    // Helper: create a populated COSStream within the test document.
    private COSStream newCosStreamWithData(byte[] data) throws IOException {
        COSStream cosStream = document.getDocument().createCOSStream();
        try (OutputStream out = cosStream.createRawOutputStream()) {
            out.write(data);
        }
        cosStream.setItem(COSName.LENGTH, COSInteger.get(data.length));
        return cosStream;
    }

    @Nested
    @DisplayName("SerializationContext.omitStreamData()")
    class OmitStreamDataTests {

        @Test
        @DisplayName("returns true only for lightweight contexts")
        void omitStreamData() {
            assertFalse(SerializationContext.DEFAULT.omitStreamData());
            assertFalse(SerializationContext.ANNOTATION_RAW_DATA.omitStreamData());
            assertFalse(SerializationContext.FORM_FIELD_RAW_DATA.omitStreamData());
            assertTrue(SerializationContext.CONTENT_STREAMS_LIGHTWEIGHT.omitStreamData());
            assertTrue(SerializationContext.RESOURCES_LIGHTWEIGHT.omitStreamData());
        }
    }

    @Nested
    @DisplayName("serializeCosValue - primitives")
    class SerializeCosValuePrimitiveTests {

        @Test
        @DisplayName("null base yields null value")
        void nullBase() throws IOException {
            assertNull(mapper.serializeCosValue(null));
        }

        @Test
        @DisplayName("COSNull serializes to NULL type")
        void cosNull() throws IOException {
            PdfJsonCosValue value = mapper.serializeCosValue(COSNull.NULL);
            assertNotNull(value);
            assertEquals(PdfJsonCosValue.Type.NULL, value.getType());
        }

        @Test
        @DisplayName("COSBoolean serializes to BOOLEAN type with value")
        void cosBoolean() throws IOException {
            PdfJsonCosValue trueValue = mapper.serializeCosValue(COSBoolean.TRUE);
            assertEquals(PdfJsonCosValue.Type.BOOLEAN, trueValue.getType());
            assertEquals(Boolean.TRUE, trueValue.getValue());

            PdfJsonCosValue falseValue = mapper.serializeCosValue(COSBoolean.FALSE);
            assertEquals(PdfJsonCosValue.Type.BOOLEAN, falseValue.getType());
            assertEquals(Boolean.FALSE, falseValue.getValue());
        }

        @Test
        @DisplayName("COSInteger serializes to INTEGER type with long value")
        void cosInteger() throws IOException {
            PdfJsonCosValue value = mapper.serializeCosValue(COSInteger.get(42L));
            assertEquals(PdfJsonCosValue.Type.INTEGER, value.getType());
            assertEquals(42L, value.getValue());
        }

        @Test
        @DisplayName("COSFloat serializes to FLOAT type with float value")
        void cosFloat() throws IOException {
            PdfJsonCosValue value = mapper.serializeCosValue(new COSFloat(1.5f));
            assertEquals(PdfJsonCosValue.Type.FLOAT, value.getType());
            assertEquals(1.5f, value.getValue());
        }

        @Test
        @DisplayName("COSName serializes to NAME type with the name literal")
        void cosName() throws IOException {
            PdfJsonCosValue value = mapper.serializeCosValue(COSName.getPDFName("Foo"));
            assertEquals(PdfJsonCosValue.Type.NAME, value.getType());
            assertEquals("Foo", value.getValue());
        }

        @Test
        @DisplayName("COSString serializes to STRING type with base64 content")
        void cosString() throws IOException {
            byte[] raw = "héllo".getBytes(StandardCharsets.UTF_8);
            PdfJsonCosValue value = mapper.serializeCosValue(new COSString(raw));
            assertEquals(PdfJsonCosValue.Type.STRING, value.getType());
            assertEquals(Base64.getEncoder().encodeToString(raw), value.getValue());
        }
    }

    @Nested
    @DisplayName("serializeCosValue - containers")
    class SerializeCosValueContainerTests {

        @Test
        @DisplayName("COSArray serializes nested items in order")
        void cosArray() throws IOException {
            COSArray array = new COSArray();
            array.add(COSInteger.get(1L));
            array.add(COSName.getPDFName("X"));
            array.add(COSBoolean.TRUE);

            PdfJsonCosValue value = mapper.serializeCosValue(array);
            assertEquals(PdfJsonCosValue.Type.ARRAY, value.getType());
            List<PdfJsonCosValue> items = value.getItems();
            assertEquals(3, items.size());
            assertEquals(PdfJsonCosValue.Type.INTEGER, items.get(0).getType());
            assertEquals(PdfJsonCosValue.Type.NAME, items.get(1).getType());
            assertEquals(PdfJsonCosValue.Type.BOOLEAN, items.get(2).getType());
        }

        @Test
        @DisplayName("COSDictionary serializes keyed entries")
        void cosDictionary() throws IOException {
            COSDictionary dict = new COSDictionary();
            dict.setItem(COSName.getPDFName("Count"), COSInteger.get(7L));
            dict.setItem(COSName.getPDFName("Type"), COSName.getPDFName("Catalog"));

            PdfJsonCosValue value = mapper.serializeCosValue(dict);
            assertEquals(PdfJsonCosValue.Type.DICTIONARY, value.getType());
            Map<String, PdfJsonCosValue> entries = value.getEntries();
            assertEquals(2, entries.size());
            assertEquals(PdfJsonCosValue.Type.INTEGER, entries.get("Count").getType());
            assertEquals(7L, entries.get("Count").getValue());
            assertEquals(PdfJsonCosValue.Type.NAME, entries.get("Type").getType());
            assertEquals("Catalog", entries.get("Type").getValue());
        }

        @Test
        @DisplayName("circular dictionary reference is replaced with a __circular__ marker")
        void circularReference() throws IOException {
            COSDictionary dict = new COSDictionary();
            dict.setItem(COSName.getPDFName("Self"), dict);

            PdfJsonCosValue value = mapper.serializeCosValue(dict);
            assertEquals(PdfJsonCosValue.Type.DICTIONARY, value.getType());
            PdfJsonCosValue self = value.getEntries().get("Self");
            assertEquals(PdfJsonCosValue.Type.NAME, self.getType());
            assertEquals("__circular__", self.getValue());
        }

        @Test
        @DisplayName("the same dictionary appearing twice (non-circular) is serialized both times")
        void repeatedNonCircularReference() throws IOException {
            COSDictionary shared = new COSDictionary();
            shared.setItem(COSName.getPDFName("V"), COSInteger.get(9L));
            COSArray array = new COSArray();
            array.add(shared);
            array.add(shared);

            PdfJsonCosValue value = mapper.serializeCosValue(array);
            List<PdfJsonCosValue> items = value.getItems();
            assertEquals(2, items.size());
            // Because the visited set is removed in finally, the second sibling occurrence is not
            // treated as circular.
            assertEquals(PdfJsonCosValue.Type.DICTIONARY, items.get(0).getType());
            assertEquals(PdfJsonCosValue.Type.DICTIONARY, items.get(1).getType());
        }
    }

    @Nested
    @DisplayName("serializeStream overloads")
    class SerializeStreamTests {

        @Test
        @DisplayName("null PDStream returns null")
        void nullPdStream() throws IOException {
            assertNull(mapper.serializeStream((PDStream) null));
        }

        @Test
        @DisplayName("null COSStream returns null")
        void nullCosStream() throws IOException {
            assertNull(mapper.serializeStream((COSStream) null));
        }

        @Test
        @DisplayName("null COSStream with explicit context returns null")
        void nullCosStreamWithContext() throws IOException {
            assertNull(mapper.serializeStream((COSStream) null, SerializationContext.DEFAULT));
        }

        @Test
        @DisplayName("null PDStream with explicit context returns null")
        void nullPdStreamWithContext() throws IOException {
            assertNull(mapper.serializeStream((PDStream) null, SerializationContext.DEFAULT));
        }

        @Test
        @DisplayName("COSStream serializes dictionary and base64 rawData")
        void cosStreamWithData() throws IOException {
            byte[] data = "stream-bytes".getBytes(StandardCharsets.UTF_8);
            COSStream cosStream = newCosStreamWithData(data);
            cosStream.setItem(COSName.TYPE, COSName.getPDFName("XObject"));

            PdfJsonStream result = mapper.serializeStream(cosStream);
            assertNotNull(result);
            assertNotNull(result.getDictionary());
            assertTrue(result.getDictionary().containsKey(COSName.TYPE.getName()));
            assertEquals(Base64.getEncoder().encodeToString(data), result.getRawData());
        }

        @Test
        @DisplayName("empty COSStream yields null rawData")
        void emptyCosStream() throws IOException {
            COSStream cosStream = newCosStreamWithData(new byte[0]);
            PdfJsonStream result = mapper.serializeStream(cosStream);
            assertNotNull(result);
            assertNull(result.getRawData());
        }

        @Test
        @DisplayName("lightweight context omits rawData even when stream has data")
        void lightweightContextOmitsData() throws IOException {
            byte[] data = "ignored".getBytes(StandardCharsets.UTF_8);
            COSStream cosStream = newCosStreamWithData(data);
            cosStream.setItem(COSName.FILTER, COSName.getPDFName("FlateDecode"));

            PdfJsonStream result =
                    mapper.serializeStream(
                            cosStream, SerializationContext.CONTENT_STREAMS_LIGHTWEIGHT);
            assertNotNull(result);
            assertNull(result.getRawData());
            // Dictionary metadata is still preserved.
            assertTrue(result.getDictionary().containsKey(COSName.FILTER.getName()));
        }

        @Test
        @DisplayName("null context is treated as DEFAULT and keeps rawData")
        void nullContextDefaultsToDefault() throws IOException {
            byte[] data = "keep".getBytes(StandardCharsets.UTF_8);
            COSStream cosStream = newCosStreamWithData(data);

            PdfJsonStream result = mapper.serializeStream(cosStream, (SerializationContext) null);
            assertNotNull(result);
            assertEquals(Base64.getEncoder().encodeToString(data), result.getRawData());
        }

        @Test
        @DisplayName("PDStream overload delegates to COSStream serialization")
        void pdStreamOverload() throws IOException {
            byte[] data = "pdstream".getBytes(StandardCharsets.UTF_8);
            PDStream pdStream = new PDStream(document, new java.io.ByteArrayInputStream(data));

            PdfJsonStream result = mapper.serializeStream(pdStream);
            assertNotNull(result);
            assertNotNull(result.getRawData());
        }

        @Test
        @DisplayName("PDStream overload with lightweight context omits rawData")
        void pdStreamOverloadLightweight() throws IOException {
            byte[] data = "pdstream".getBytes(StandardCharsets.UTF_8);
            PDStream pdStream = new PDStream(document, new java.io.ByteArrayInputStream(data));

            PdfJsonStream result =
                    mapper.serializeStream(pdStream, SerializationContext.RESOURCES_LIGHTWEIGHT);
            assertNotNull(result);
            assertNull(result.getRawData());
        }

        @Test
        @DisplayName("serializeCosValue of a COSStream produces STREAM type wrapping the stream")
        void serializeCosValueWrapsStream() throws IOException {
            byte[] data = "abc".getBytes(StandardCharsets.UTF_8);
            COSStream cosStream = newCosStreamWithData(data);

            PdfJsonCosValue value = mapper.serializeCosValue(cosStream);
            assertEquals(PdfJsonCosValue.Type.STREAM, value.getType());
            assertNotNull(value.getStream());
            assertEquals(Base64.getEncoder().encodeToString(data), value.getStream().getRawData());
        }
    }

    @Nested
    @DisplayName("deserializeCosValue")
    class DeserializeCosValueTests {

        @Test
        @DisplayName("null value returns null")
        void nullValue() throws IOException {
            assertNull(mapper.deserializeCosValue(null, document));
        }

        @Test
        @DisplayName("value with null type returns null")
        void nullType() throws IOException {
            PdfJsonCosValue value = PdfJsonCosValue.builder().value("x").build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("NULL type returns COSNull")
        void nullTypeValue() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NULL).build();
            assertEquals(COSNull.NULL, mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("BOOLEAN type returns matching COSBoolean")
        void booleanType() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.BOOLEAN)
                            .value(Boolean.TRUE)
                            .build();
            COSBase result = mapper.deserializeCosValue(value, document);
            assertEquals(COSBoolean.TRUE, result);
        }

        @Test
        @DisplayName("BOOLEAN type with non-boolean value returns null")
        void booleanTypeWrongValue() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.BOOLEAN)
                            .value("not-a-boolean")
                            .build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("INTEGER type returns COSInteger from a Number value")
        void integerType() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.INTEGER)
                            .value(123L)
                            .build();
            COSBase result = mapper.deserializeCosValue(value, document);
            assertInstanceOf(COSInteger.class, result);
            assertEquals(123L, ((COSInteger) result).longValue());
        }

        @Test
        @DisplayName("INTEGER type accepts an Integer value via Number")
        void integerTypeFromInteger() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.INTEGER)
                            .value(Integer.valueOf(5))
                            .build();
            COSBase result = mapper.deserializeCosValue(value, document);
            assertInstanceOf(COSInteger.class, result);
            assertEquals(5L, ((COSInteger) result).longValue());
        }

        @Test
        @DisplayName("INTEGER type with non-number returns null")
        void integerTypeWrongValue() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.INTEGER)
                            .value("oops")
                            .build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("FLOAT type returns COSFloat from a Number value")
        void floatType() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.FLOAT).value(2.25f).build();
            COSBase result = mapper.deserializeCosValue(value, document);
            assertInstanceOf(COSFloat.class, result);
            assertEquals(2.25f, ((COSFloat) result).floatValue());
        }

        @Test
        @DisplayName("FLOAT type with non-number returns null")
        void floatTypeWrongValue() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.FLOAT)
                            .value("oops")
                            .build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("NAME type returns COSName from a String value")
        void nameType() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.NAME)
                            .value("MyName")
                            .build();
            COSBase result = mapper.deserializeCosValue(value, document);
            assertEquals(COSName.getPDFName("MyName"), result);
        }

        @Test
        @DisplayName("NAME type with non-string returns null")
        void nameTypeWrongValue() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value(123L).build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("STRING type decodes base64 into COSString bytes")
        void stringType() throws IOException {
            byte[] raw = "round-trip".getBytes(StandardCharsets.UTF_8);
            String encoded = Base64.getEncoder().encodeToString(raw);
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.STRING)
                            .value(encoded)
                            .build();
            COSBase result = mapper.deserializeCosValue(value, document);
            assertInstanceOf(COSString.class, result);
            assertArrayEquals(raw, ((COSString) result).getBytes());
        }

        @Test
        @DisplayName("STRING type with invalid base64 returns null")
        void stringTypeInvalidBase64() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.STRING)
                            .value("!!!not base64!!!")
                            .build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("STRING type with non-string value returns null")
        void stringTypeWrongValue() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STRING).value(42L).build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("ARRAY type deserializes each item")
        void arrayType() throws IOException {
            PdfJsonCosValue item1 =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(1L).build();
            PdfJsonCosValue item2 =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.NAME).value("N").build();
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.ARRAY)
                            .items(List.of(item1, item2))
                            .build();

            COSBase result = mapper.deserializeCosValue(value, document);
            assertInstanceOf(COSArray.class, result);
            COSArray array = (COSArray) result;
            assertEquals(2, array.size());
            assertEquals(1L, ((COSInteger) array.get(0)).longValue());
            assertEquals(COSName.getPDFName("N"), array.get(1));
        }

        @Test
        @DisplayName("ARRAY type substitutes COSNull for un-deserializable items")
        void arrayTypeWithNullItems() throws IOException {
            // An INTEGER type with a non-number value deserializes to null and is replaced by
            // COSNull.NULL inside the array.
            PdfJsonCosValue bad =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.INTEGER)
                            .value("nope")
                            .build();
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.ARRAY)
                            .items(List.of(bad))
                            .build();

            COSArray result = (COSArray) mapper.deserializeCosValue(value, document);
            assertEquals(1, result.size());
            assertEquals(COSNull.NULL, result.get(0));
        }

        @Test
        @DisplayName("ARRAY type with null items list yields empty COSArray")
        void arrayTypeNullItems() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.ARRAY).build();
            COSArray result = (COSArray) mapper.deserializeCosValue(value, document);
            assertNotNull(result);
            assertEquals(0, result.size());
        }

        @Test
        @DisplayName("DICTIONARY type deserializes entries by key")
        void dictionaryType() throws IOException {
            Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
            entries.put(
                    "Count",
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.INTEGER).value(3L).build());
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.DICTIONARY)
                            .entries(entries)
                            .build();

            COSDictionary result = (COSDictionary) mapper.deserializeCosValue(value, document);
            assertNotNull(result);
            assertEquals(3L, ((COSInteger) result.getItem("Count")).longValue());
        }

        @Test
        @DisplayName("DICTIONARY type skips entries that deserialize to null")
        void dictionaryTypeSkipsNullEntries() throws IOException {
            Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
            entries.put(
                    "Bad",
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.INTEGER)
                            .value("nope")
                            .build());
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.DICTIONARY)
                            .entries(entries)
                            .build();

            COSDictionary result = (COSDictionary) mapper.deserializeCosValue(value, document);
            assertNotNull(result);
            assertNull(result.getItem(COSName.getPDFName("Bad")));
        }

        @Test
        @DisplayName("DICTIONARY type with null entries map yields empty COSDictionary")
        void dictionaryTypeNullEntries() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.DICTIONARY).build();
            COSDictionary result = (COSDictionary) mapper.deserializeCosValue(value, document);
            assertNotNull(result);
            assertEquals(0, result.size());
        }

        @Test
        @DisplayName("STREAM type with null stream returns null")
        void streamTypeNullStream() throws IOException {
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STREAM).build();
            assertNull(mapper.deserializeCosValue(value, document));
        }

        @Test
        @DisplayName("STREAM type builds a COSStream from the model")
        void streamType() throws IOException {
            byte[] data = "stream-content".getBytes(StandardCharsets.UTF_8);
            PdfJsonStream streamModel =
                    PdfJsonStream.builder()
                            .rawData(Base64.getEncoder().encodeToString(data))
                            .build();
            PdfJsonCosValue value =
                    PdfJsonCosValue.builder().type(PdfJsonCosValue.Type.STREAM).stream(streamModel)
                            .build();

            COSBase result = mapper.deserializeCosValue(value, document);
            assertInstanceOf(COSStream.class, result);
            assertStreamRawEquals(data, (COSStream) result);
        }
    }

    @Nested
    @DisplayName("buildStreamFromModel")
    class BuildStreamFromModelTests {

        @Test
        @DisplayName("null model returns null")
        void nullModel() throws IOException {
            assertNull(mapper.buildStreamFromModel(null, document));
        }

        @Test
        @DisplayName("model with rawData writes base64-decoded bytes and sets Length")
        void withRawData() throws IOException {
            byte[] data = "hello-world".getBytes(StandardCharsets.UTF_8);
            PdfJsonStream model =
                    PdfJsonStream.builder()
                            .rawData(Base64.getEncoder().encodeToString(data))
                            .build();

            COSStream result = mapper.buildStreamFromModel(model, document);
            assertNotNull(result);
            assertStreamRawEquals(data, result);
            assertEquals(data.length, ((COSInteger) result.getItem(COSName.LENGTH)).longValue());
        }

        @Test
        @DisplayName("model with dictionary entries copies them onto the stream")
        void withDictionary() throws IOException {
            Map<String, PdfJsonCosValue> dict = new LinkedHashMap<>();
            dict.put(
                    "Type",
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.NAME)
                            .value("XObject")
                            .build());
            dict.put(
                    "Width",
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.INTEGER)
                            .value(100L)
                            .build());
            PdfJsonStream model = PdfJsonStream.builder().dictionary(dict).build();

            COSStream result = mapper.buildStreamFromModel(model, document);
            assertNotNull(result);
            assertEquals(COSName.getPDFName("XObject"), result.getItem(COSName.TYPE));
            assertEquals(
                    100L, ((COSInteger) result.getItem(COSName.getPDFName("Width"))).longValue());
        }

        @Test
        @DisplayName("model dictionary entry that deserializes to null is skipped")
        void dictionaryEntryNullSkipped() throws IOException {
            Map<String, PdfJsonCosValue> dict = new LinkedHashMap<>();
            dict.put(
                    "Bad",
                    PdfJsonCosValue.builder()
                            .type(PdfJsonCosValue.Type.NAME)
                            .value(999L) // non-string -> null
                            .build());
            PdfJsonStream model = PdfJsonStream.builder().dictionary(dict).build();

            COSStream result = mapper.buildStreamFromModel(model, document);
            assertNotNull(result);
            assertNull(result.getItem(COSName.getPDFName("Bad")));
        }

        @Test
        @DisplayName("model with null/blank rawData sets Length to zero and writes nothing")
        void blankRawData() throws IOException {
            PdfJsonStream model = PdfJsonStream.builder().rawData("   ").build();
            COSStream result = mapper.buildStreamFromModel(model, document);
            assertNotNull(result);
            assertEquals(0L, ((COSInteger) result.getItem(COSName.LENGTH)).longValue());
            // Blank rawData takes the else-branch: Length is set to 0 but createRawOutputStream()
            // is
            // never called, so nothing is written. PDFBox cannot open a raw InputStream on a stream
            // that was never written to, which is the documented "writes nothing" behaviour.
            assertThrows(IOException.class, result::createRawInputStream);
        }

        @Test
        @DisplayName("model with no rawData sets Length to zero")
        void noRawData() throws IOException {
            PdfJsonStream model = PdfJsonStream.builder().build();
            COSStream result = mapper.buildStreamFromModel(model, document);
            assertNotNull(result);
            assertEquals(0L, ((COSInteger) result.getItem(COSName.LENGTH)).longValue());
        }

        @Test
        @DisplayName("model with invalid base64 rawData falls back to empty data")
        void invalidBase64RawData() throws IOException {
            PdfJsonStream model = PdfJsonStream.builder().rawData("###not-base64###").build();
            COSStream result = mapper.buildStreamFromModel(model, document);
            assertNotNull(result);
            assertEquals(0L, ((COSInteger) result.getItem(COSName.LENGTH)).longValue());
            assertStreamRawEquals(new byte[0], result);
        }
    }

    @Nested
    @DisplayName("round trip serialize -> deserialize")
    class RoundTripTests {

        @Test
        @DisplayName("nested array/dictionary structure survives a round trip")
        void nestedStructure() throws IOException {
            COSDictionary original = new COSDictionary();
            original.setItem(COSName.getPDFName("Int"), COSInteger.get(11L));
            original.setItem(COSName.getPDFName("Name"), COSName.getPDFName("Hello"));
            original.setItem(COSName.getPDFName("Bool"), COSBoolean.FALSE);
            COSArray inner = new COSArray();
            inner.add(new COSFloat(3.5f));
            inner.add(new COSString("abc".getBytes(StandardCharsets.UTF_8)));
            original.setItem(COSName.getPDFName("Arr"), inner);

            PdfJsonCosValue serialized = mapper.serializeCosValue(original);
            COSBase deserialized = mapper.deserializeCosValue(serialized, document);

            assertInstanceOf(COSDictionary.class, deserialized);
            COSDictionary result = (COSDictionary) deserialized;
            assertEquals(11L, ((COSInteger) result.getItem(COSName.getPDFName("Int"))).longValue());
            assertEquals(COSName.getPDFName("Hello"), result.getItem(COSName.getPDFName("Name")));
            assertEquals(COSBoolean.FALSE, result.getItem(COSName.getPDFName("Bool")));

            COSArray resultArr = (COSArray) result.getItem(COSName.getPDFName("Arr"));
            assertEquals(2, resultArr.size());
            assertEquals(3.5f, ((COSFloat) resultArr.get(0)).floatValue());
            assertArrayEquals(
                    "abc".getBytes(StandardCharsets.UTF_8),
                    ((COSString) resultArr.get(1)).getBytes());
        }

        @Test
        @DisplayName("stream data survives a round trip")
        void streamRoundTrip() throws IOException {
            byte[] data = "round-trip-stream".getBytes(StandardCharsets.UTF_8);
            COSStream cosStream = newCosStreamWithData(data);
            cosStream.setItem(COSName.TYPE, COSName.getPDFName("XObject"));

            PdfJsonCosValue serialized = mapper.serializeCosValue(cosStream);
            COSBase deserialized = mapper.deserializeCosValue(serialized, document);

            assertInstanceOf(COSStream.class, deserialized);
            COSStream result = (COSStream) deserialized;
            assertStreamRawEquals(data, result);
            assertEquals(COSName.getPDFName("XObject"), result.getItem(COSName.TYPE));
        }
    }

    // Reads the raw (undecoded) bytes from a COSStream and asserts equality.
    private void assertStreamRawEquals(byte[] expected, COSStream cosStream) throws IOException {
        try (InputStream in = cosStream.createRawInputStream()) {
            byte[] actual = in.readAllBytes();
            assertArrayEquals(expected, actual);
        }
    }
}
