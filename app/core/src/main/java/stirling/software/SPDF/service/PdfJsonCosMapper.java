package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSBoolean;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonStream;

@Slf4j
@Component
public class PdfJsonCosMapper {

    public enum SerializationContext {
        DEFAULT,
        ANNOTATION_RAW_DATA,
        FORM_FIELD_RAW_DATA,
        CONTENT_STREAMS_LIGHTWEIGHT,
        RESOURCES_LIGHTWEIGHT;

        public boolean omitStreamData() {
            return this != DEFAULT;
        }
    }

    public PdfJsonStream serializeStream(PDStream stream) throws IOException {
        if (stream == null) {
            return null;
        }
        return serializeStream(
                stream.getCOSObject(),
                Collections.newSetFromMap(new IdentityHashMap<>()),
                SerializationContext.DEFAULT);
    }

    public PdfJsonStream serializeStream(COSStream cosStream) throws IOException {
        if (cosStream == null) {
            return null;
        }
        return serializeStream(
                cosStream,
                Collections.newSetFromMap(new IdentityHashMap<>()),
                SerializationContext.DEFAULT);
    }

    public PdfJsonStream serializeStream(COSStream cosStream, SerializationContext context)
            throws IOException {
        if (cosStream == null) {
            return null;
        }
        SerializationContext effective =
                context != null ? context : SerializationContext.DEFAULT;
        return serializeStream(
                cosStream, Collections.newSetFromMap(new IdentityHashMap<>()), effective);
    }

    public PdfJsonStream serializeStream(PDStream stream, SerializationContext context)
            throws IOException {
        if (stream == null) {
            return null;
        }
        return serializeStream(stream.getCOSObject(), context);
    }

    public PdfJsonCosValue serializeCosValue(COSBase base) throws IOException {
        return serializeCosValue(
                base,
                Collections.newSetFromMap(new IdentityHashMap<>()),
                SerializationContext.DEFAULT);
    }

    public PdfJsonCosValue serializeCosValue(COSBase base, SerializationContext context)
            throws IOException {
        SerializationContext effective =
                context != null ? context : SerializationContext.DEFAULT;
        return serializeCosValue(
                base, Collections.newSetFromMap(new IdentityHashMap<>()), effective);
    }

    public COSBase deserializeCosValue(PdfJsonCosValue value, PDDocument document)
            throws IOException {
        if (value == null || value.getType() == null) {
            return null;
        }
        switch (value.getType()) {
            case NULL:
                return COSNull.NULL;
            case BOOLEAN:
                if (value.getValue() instanceof Boolean bool) {
                    return COSBoolean.getBoolean(bool);
                }
                return null;
            case INTEGER:
                if (value.getValue() instanceof Number number) {
                    return COSInteger.get(number.longValue());
                }
                return null;
            case FLOAT:
                if (value.getValue() instanceof Number number) {
                    return new COSFloat(number.floatValue());
                }
                return null;
            case NAME:
                if (value.getValue() instanceof String name) {
                    return COSName.getPDFName(name);
                }
                return null;
            case STRING:
                if (value.getValue() instanceof String encoded) {
                    try {
                        byte[] bytes = Base64.getDecoder().decode(encoded);
                        return new COSString(bytes);
                    } catch (IllegalArgumentException ex) {
                        log.debug("Failed to decode COSString value: {}", ex.getMessage());
                    }
                }
                return null;
            case ARRAY:
                COSArray array = new COSArray();
                if (value.getItems() != null) {
                    for (PdfJsonCosValue item : value.getItems()) {
                        COSBase entry = deserializeCosValue(item, document);
                        if (entry != null) {
                            array.add(entry);
                        } else {
                            array.add(COSNull.NULL);
                        }
                    }
                }
                return array;
            case DICTIONARY:
                COSDictionary dictionary = new COSDictionary();
                if (value.getEntries() != null) {
                    for (Map.Entry<String, PdfJsonCosValue> entry : value.getEntries().entrySet()) {
                        COSName key = COSName.getPDFName(entry.getKey());
                        COSBase entryValue = deserializeCosValue(entry.getValue(), document);
                        if (entryValue != null) {
                            dictionary.setItem(key, entryValue);
                        }
                    }
                }
                return dictionary;
            case STREAM:
                if (value.getStream() != null) {
                    return buildStreamFromModel(value.getStream(), document);
                }
                return null;
            default:
                return null;
        }
    }

    public COSStream buildStreamFromModel(PdfJsonStream streamModel, PDDocument document)
            throws IOException {
        if (streamModel == null) {
            return null;
        }
        COSStream cosStream = document.getDocument().createCOSStream();
        if (streamModel.getDictionary() != null) {
            for (Map.Entry<String, PdfJsonCosValue> entry :
                    streamModel.getDictionary().entrySet()) {
                COSName key = COSName.getPDFName(entry.getKey());
                COSBase value = deserializeCosValue(entry.getValue(), document);
                if (value != null) {
                    cosStream.setItem(key, value);
                }
            }
        }

        String rawData = streamModel.getRawData();
        if (rawData != null && !rawData.isBlank()) {
            byte[] data;
            try {
                data = Base64.getDecoder().decode(rawData);
            } catch (IllegalArgumentException ex) {
                log.debug("Invalid base64 content stream data: {}", ex.getMessage());
                data = new byte[0];
            }
            try (OutputStream outputStream = cosStream.createRawOutputStream()) {
                outputStream.write(data);
            }
            cosStream.setItem(COSName.LENGTH, COSInteger.get(data.length));
        } else {
            cosStream.setItem(COSName.LENGTH, COSInteger.get(0));
        }
        return cosStream;
    }

    private PdfJsonCosValue serializeCosValue(
            COSBase base, Set<COSBase> visited, SerializationContext context) throws IOException {
        if (base == null) {
            return null;
        }
        if (base instanceof COSObject cosObject) {
            base = cosObject.getObject();
            if (base == null) {
                return null;
            }
        }

        boolean complex =
                base instanceof COSDictionary
                        || base instanceof COSArray
                        || base instanceof COSStream;
        if (complex) {
            if (!visited.add(base)) {
                return PdfJsonCosValue.builder()
                        .type(PdfJsonCosValue.Type.NAME)
                        .value("__circular__")
                        .build();
            }
        }

        try {
            PdfJsonCosValue.PdfJsonCosValueBuilder builder = PdfJsonCosValue.builder();
            if (base instanceof COSNull) {
                builder.type(PdfJsonCosValue.Type.NULL);
                return builder.build();
            }
            if (base instanceof COSBoolean booleanValue) {
                builder.type(PdfJsonCosValue.Type.BOOLEAN).value(booleanValue.getValue());
                return builder.build();
            }
            if (base instanceof COSInteger integer) {
                builder.type(PdfJsonCosValue.Type.INTEGER).value(integer.longValue());
                return builder.build();
            }
            if (base instanceof COSFloat floatValue) {
                builder.type(PdfJsonCosValue.Type.FLOAT).value(floatValue.floatValue());
                return builder.build();
            }
            if (base instanceof COSName name) {
                builder.type(PdfJsonCosValue.Type.NAME).value(name.getName());
                return builder.build();
            }
            if (base instanceof COSString cosString) {
                builder.type(PdfJsonCosValue.Type.STRING)
                        .value(Base64.getEncoder().encodeToString(cosString.getBytes()));
                return builder.build();
            }
            if (base instanceof COSArray array) {
                List<PdfJsonCosValue> items = new ArrayList<>(array.size());
                for (COSBase item : array) {
                    PdfJsonCosValue serialized = serializeCosValue(item, visited, context);
                    items.add(serialized);
                }
                builder.type(PdfJsonCosValue.Type.ARRAY).items(items);
                return builder.build();
            }
            if (base instanceof COSStream stream) {
                builder.type(PdfJsonCosValue.Type.STREAM)
                        .stream(serializeStream(stream, visited, context));
                return builder.build();
            }
            if (base instanceof COSDictionary dictionary) {
                Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
                for (COSName key : dictionary.keySet()) {
                    PdfJsonCosValue serialized =
                            serializeCosValue(dictionary.getDictionaryObject(key), visited, context);
                    entries.put(key.getName(), serialized);
                }
                builder.type(PdfJsonCosValue.Type.DICTIONARY).entries(entries);
                return builder.build();
            }
            return null;
        } finally {
            if (complex) {
                visited.remove(base);
            }
        }
    }

    private PdfJsonStream serializeStream(
            COSStream cosStream, Set<COSBase> visited, SerializationContext context)
            throws IOException {
        Map<String, PdfJsonCosValue> dictionary = new LinkedHashMap<>();
        for (COSName key : cosStream.keySet()) {
            COSBase value = cosStream.getDictionaryObject(key);
            PdfJsonCosValue serialized = serializeCosValue(value, visited, context);
            if (serialized != null) {
                dictionary.put(key.getName(), serialized);
            }
        }

        if (context != null && context.omitStreamData()) {
            log.debug("Omitting stream rawData during {} serialization", context);
            return PdfJsonStream.builder().dictionary(dictionary).rawData(null).build();
        }

        String rawData = null;
        try (InputStream inputStream = cosStream.createRawInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            if (inputStream != null) {
                inputStream.transferTo(baos);
            }
            byte[] data = baos.toByteArray();
            if (data.length > 0) {
                rawData = Base64.getEncoder().encodeToString(data);
            }
        }
        return PdfJsonStream.builder().dictionary(dictionary).rawData(rawData).build();
    }
}
