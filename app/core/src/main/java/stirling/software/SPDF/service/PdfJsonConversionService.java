package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TimeZone;

import org.apache.pdfbox.contentstream.operator.Operator;
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
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.Matrix;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonCosValue;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonFontCidSystemInfo;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonStream;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class PdfJsonConversionService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;

    private static final String FALLBACK_FONT_ID = "fallback-noto-sans";
    private static final String DEFAULT_FALLBACK_FONT_LOCATION =
            "classpath:/static/fonts/NotoSans-Regular.ttf";

    @Value("${stirling.pdf.fallback-font:" + DEFAULT_FALLBACK_FONT_LOCATION + "}")
    private String fallbackFontLocation;

    private byte[] fallbackFontBytes;

    public byte[] convertPdfToJson(MultipartFile file) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }
        try (PDDocument document = pdfDocumentFactory.load(file.getInputStream(), true)) {
            int totalPages = document.getNumberOfPages();
            log.info("Converting PDF to JSON ({} pages)", totalPages);
            Map<String, PdfJsonFont> fonts = new LinkedHashMap<>();
            Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();

            Map<Integer, Map<PDFont, String>> pageFontResources = new HashMap<>();
            int pageNumber = 1;
            for (PDPage page : document.getPages()) {
                Map<PDFont, String> resourceMap =
                        collectFontsForPage(document, page, pageNumber, fonts);
                pageFontResources.put(pageNumber, resourceMap);
                log.debug(
                        "PDF→JSON: collected {} font resources on page {}",
                        resourceMap.size(),
                        pageNumber);
                pageNumber++;
            }

            TextCollectingStripper stripper =
                    new TextCollectingStripper(document, fonts, textByPage, pageFontResources);
            stripper.setSortByPosition(true);
            stripper.getText(document);

            PdfJsonDocument pdfJson = new PdfJsonDocument();
            pdfJson.setMetadata(extractMetadata(document));
            pdfJson.setXmpMetadata(extractXmpMetadata(document));
            List<PdfJsonFont> serializedFonts = new ArrayList<>(fonts.values());
            serializedFonts.sort(
                    Comparator.comparing(
                            PdfJsonFont::getUid, Comparator.nullsLast(Comparator.naturalOrder())));
            pdfJson.setFonts(serializedFonts);
            pdfJson.setPages(extractPages(document, textByPage));

            log.info(
                    "PDF→JSON conversion complete (fonts: {}, pages: {})",
                    serializedFonts.size(),
                    pdfJson.getPages().size());

            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(pdfJson);
        }
    }

    public byte[] convertJsonToPdf(MultipartFile file) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }
        byte[] jsonBytes = file.getBytes();
        PdfJsonDocument pdfJson = objectMapper.readValue(jsonBytes, PdfJsonDocument.class);

        List<PdfJsonFont> fontModels = pdfJson.getFonts();
        if (fontModels == null) {
            fontModels = new ArrayList<>();
            pdfJson.setFonts(fontModels);
        }

        try (PDDocument document = new PDDocument()) {
            applyMetadata(document, pdfJson.getMetadata());
            applyXmpMetadata(document, pdfJson.getXmpMetadata());

            Map<String, PDFont> fontMap = buildFontMap(document, fontModels);
            log.info("Converting JSON to PDF ({} font resources)", fontMap.size());

            List<PdfJsonPage> pages = pdfJson.getPages();
            if (pages == null) {
                pages = new ArrayList<>();
            }

            int pageIndex = 0;
            for (PdfJsonPage pageModel : pages) {
                int pageNumberValue =
                        pageModel.getPageNumber() != null
                                ? pageModel.getPageNumber()
                                : pageIndex + 1;
                log.info("Reconstructing page {}", pageNumberValue);
                PDRectangle pageSize =
                        new PDRectangle(
                                safeFloat(pageModel.getWidth(), 612f),
                                safeFloat(pageModel.getHeight(), 792f));
                PDPage page = new PDPage(pageSize);
                if (pageModel.getRotation() != null) {
                    page.setRotation(pageModel.getRotation());
                }
                document.addPage(page);

                applyPageResources(document, page, pageModel.getResources());

                List<PDStream> preservedStreams =
                        buildContentStreams(document, pageModel.getContentStreams());
                if (!preservedStreams.isEmpty()) {
                    page.setContents(preservedStreams);
                }

                List<PdfJsonTextElement> elements =
                        pageModel.getTextElements() != null
                                ? pageModel.getTextElements()
                                : new ArrayList<>();

                boolean fallbackAssigned =
                        preflightTextElements(
                                document, fontMap, fontModels, elements, pageNumberValue);

                log.info(
                        "Page {} preflight complete (elements={}, fallbackApplied={})",
                        pageNumberValue,
                        elements.size(),
                        fallbackAssigned);

                if (elements.stream().anyMatch(el -> FALLBACK_FONT_ID.equals(el.getFontId()))) {
                    ensureFallbackResource(page, fontMap.get(buildFontKey(-1, FALLBACK_FONT_ID)));
                    log.info("Page {} uses fallback font for some elements", pageNumberValue);
                }

                boolean hasText = !elements.isEmpty();
                boolean rewriteSucceeded = false;

                if (!preservedStreams.isEmpty() && hasText) {
                    if (fallbackAssigned) {
                        log.info(
                                "Skipping token rewrite for page {} because fallback font was applied",
                                pageNumberValue);
                        rewriteSucceeded = false;
                    } else {
                        log.info("Attempting token rewrite for page {}", pageNumberValue);
                        rewriteSucceeded = rewriteTextOperators(document, page, elements);
                        if (!rewriteSucceeded) {
                            log.info(
                                    "Token rewrite failed for page {}, regenerating text stream",
                                    pageNumberValue);
                        } else {
                            log.info("Token rewrite succeeded for page {}", pageNumberValue);
                        }
                    }
                }

                if (!hasText) {
                    pageIndex++;
                    continue;
                }

                if (!rewriteSucceeded) {
                    log.info("Regenerating text content for page {}", pageNumberValue);
                    regenerateTextContent(document, page, elements, fontMap, pageNumberValue);
                    log.info("Text regeneration complete for page {}", pageNumberValue);
                }
                pageIndex++;
            }

            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                return baos.toByteArray();
            }
        }
    }

    private Map<PDFont, String> collectFontsForPage(
            PDDocument document, PDPage page, int pageNumber, Map<String, PdfJsonFont> fonts)
            throws IOException {
        PDResources resources = page.getResources();
        if (resources == null) {
            return Collections.emptyMap();
        }

        Map<PDFont, String> mapping = new HashMap<>();
        for (COSName resourceName : resources.getFontNames()) {
            PDFont font = resources.getFont(resourceName);
            if (font == null) {
                continue;
            }
            String fontId = resourceName.getName();
            mapping.put(font, fontId);

            String key = buildFontKey(pageNumber, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(key, buildFontModel(document, font, fontId, pageNumber));
            }
        }
        return mapping;
    }

    private String buildFontKey(int pageNumber, String fontId) {
        return pageNumber + ":" + fontId;
    }

    private String buildFontKey(Integer pageNumber, String fontId) {
        int page = pageNumber != null ? pageNumber : -1;
        return buildFontKey(page, fontId);
    }

    private PdfJsonFont buildFontModel(
            PDDocument document, PDFont font, String fontId, int pageNumber) throws IOException {
        String subtype = font.getCOSObject().getNameAsString(COSName.SUBTYPE);
        String encoding = resolveEncoding(font);
        PdfJsonFontCidSystemInfo cidInfo = extractCidSystemInfo(font.getCOSObject());
        boolean embedded = font.isEmbedded();
        FontProgramData programData = embedded ? extractFontProgram(font) : null;
        String toUnicode = extractToUnicode(font.getCOSObject());
        String standard14Name = resolveStandard14Name(font);
        Integer flags =
                font.getFontDescriptor() != null ? font.getFontDescriptor().getFlags() : null;

        return PdfJsonFont.builder()
                .id(fontId)
                .pageNumber(pageNumber)
                .uid(buildFontKey(pageNumber, fontId))
                .baseName(font.getName())
                .subtype(subtype)
                .encoding(encoding)
                .cidSystemInfo(cidInfo)
                .embedded(embedded)
                .program(programData != null ? programData.getBase64() : null)
                .programFormat(programData != null ? programData.getFormat() : null)
                .toUnicode(toUnicode)
                .standard14Name(standard14Name)
                .fontDescriptorFlags(flags)
                .build();
    }

    private boolean preflightTextElements(
            PDDocument document,
            Map<String, PDFont> fontMap,
            List<PdfJsonFont> fontModels,
            List<PdfJsonTextElement> elements,
            int pageNumber)
            throws IOException {
        if (elements == null || elements.isEmpty()) {
            return false;
        }

        PDFont fallbackFont = fontMap.get(buildFontKey(-1, FALLBACK_FONT_ID));
        boolean fallbackApplied = false;
        for (PdfJsonTextElement element : elements) {
            String text = Objects.toString(element.getText(), "");
            if (text.isEmpty()) {
                continue;
            }

            PDFont font = fontMap.get(buildFontKey(pageNumber, element.getFontId()));
            boolean encodable = false;
            if (font != null) {
                try {
                    font.encode(text);
                    encodable = true;
                } catch (IOException | IllegalArgumentException ex) {
                    log.debug(
                            "Font {} missing glyphs for text '{}': {}",
                            element.getFontId(),
                            text,
                            ex.getMessage());
                }
            }

            if (encodable) {
                continue;
            }

            element.setFontId(FALLBACK_FONT_ID);
            log.info(
                    "Assigning fallback font to text element on page {} (text='{}')",
                    pageNumber,
                    abbreviate(text));
            if (fallbackFont == null) {
                fallbackFont = loadFallbackPdfFont(document);
                fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), fallbackFont);
                if (fontModels.stream().noneMatch(f -> FALLBACK_FONT_ID.equals(f.getId()))) {
                    fontModels.add(buildFallbackFontModel());
                }
            }
            fallbackApplied = true;
        }
        return fallbackApplied;
    }

    private PdfJsonFont buildFallbackFontModel() throws IOException {
        byte[] bytes = loadFallbackFontBytes();
        String base64 = Base64.getEncoder().encodeToString(bytes);
        return PdfJsonFont.builder()
                .id(FALLBACK_FONT_ID)
                .uid(FALLBACK_FONT_ID)
                .baseName("NotoSans-Regular")
                .subtype("TrueType")
                .embedded(true)
                .program(base64)
                .programFormat("ttf")
                .build();
    }

    private void ensureFallbackResource(PDPage page, PDFont fallbackFont) {
        if (fallbackFont == null) {
            return;
        }
        PDResources resources = page.getResources();
        if (resources == null) {
            resources = new PDResources();
            page.setResources(resources);
        }
        COSName fallbackName = COSName.getPDFName(FALLBACK_FONT_ID);
        boolean exists = false;
        for (COSName name : resources.getFontNames()) {
            if (fallbackName.equals(name)) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            resources.put(fallbackName, fallbackFont);
        }
    }

    private PDFont loadFallbackPdfFont(PDDocument document) throws IOException {
        byte[] bytes = loadFallbackFontBytes();
        try (InputStream stream = new ByteArrayInputStream(bytes)) {
            return PDType0Font.load(document, stream, true);
        }
    }

    private byte[] loadFallbackFontBytes() throws IOException {
        if (fallbackFontBytes == null) {
            Resource resource = resourceLoader.getResource(fallbackFontLocation);
            if (!resource.exists()) {
                throw new IOException(
                        "Fallback font resource not found at " + fallbackFontLocation);
            }
            try (InputStream inputStream = resource.getInputStream();
                    ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                inputStream.transferTo(baos);
                fallbackFontBytes = baos.toByteArray();
            }
        }
        return fallbackFontBytes;
    }

    private PdfJsonFontCidSystemInfo extractCidSystemInfo(COSDictionary fontDictionary) {
        if (fontDictionary == null) {
            return null;
        }
        COSBase base = fontDictionary.getDictionaryObject(COSName.CIDSYSTEMINFO);
        if (!(base instanceof COSDictionary cidDictionary)) {
            return null;
        }
        String registry = cidDictionary.getString(COSName.REGISTRY);
        String ordering = cidDictionary.getString(COSName.ORDERING);
        int supplementValue = cidDictionary.getInt(COSName.SUPPLEMENT, -1);
        if (registry == null && ordering == null && supplementValue < 0) {
            return null;
        }
        PdfJsonFontCidSystemInfo info = new PdfJsonFontCidSystemInfo();
        info.setRegistry(registry);
        info.setOrdering(ordering);
        if (supplementValue >= 0) {
            info.setSupplement(supplementValue);
        }
        return info;
    }

    private FontProgramData extractFontProgram(PDFont font) throws IOException {
        PDFontDescriptor descriptor = font.getFontDescriptor();
        if (descriptor == null) {
            return null;
        }

        PDStream fontFile3 = descriptor.getFontFile3();
        if (fontFile3 != null) {
            String subtype = fontFile3.getCOSObject().getNameAsString(COSName.SUBTYPE);
            return readFontProgram(fontFile3, subtype != null ? subtype : "fontfile3", false);
        }

        PDStream fontFile2 = descriptor.getFontFile2();
        if (fontFile2 != null) {
            return readFontProgram(fontFile2, null, true);
        }

        PDStream fontFile = descriptor.getFontFile();
        if (fontFile != null) {
            return readFontProgram(fontFile, "type1", false);
        }

        return null;
    }

    private FontProgramData readFontProgram(
            PDStream stream, String formatHint, boolean detectTrueType) throws IOException {
        try (InputStream inputStream = stream.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            String format = formatHint;
            if (detectTrueType) {
                format = detectTrueTypeFormat(data);
            }
            String base64 = Base64.getEncoder().encodeToString(data);
            return new FontProgramData(base64, format);
        }
    }

    private String detectTrueTypeFormat(byte[] data) {
        if (data == null || data.length < 4) {
            return "ttf";
        }
        String tag = new String(data, 0, 4, StandardCharsets.US_ASCII);
        if ("OTTO".equals(tag)) {
            return "otf";
        }
        if ("true".equals(tag) || "typ1".equals(tag)) {
            return "ttf";
        }
        int value =
                ((data[0] & 0xFF) << 24)
                        | ((data[1] & 0xFF) << 16)
                        | ((data[2] & 0xFF) << 8)
                        | (data[3] & 0xFF);
        if (value == 0x00010000) {
            return "ttf";
        }
        return "ttf";
    }

    private String extractToUnicode(COSDictionary fontDictionary) throws IOException {
        if (fontDictionary == null) {
            return null;
        }
        COSBase base = fontDictionary.getDictionaryObject(COSName.TO_UNICODE);
        if (!(base instanceof COSStream stream)) {
            return null;
        }
        try (InputStream inputStream = stream.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            if (data.length == 0) {
                return null;
            }
            return Base64.getEncoder().encodeToString(data);
        }
    }

    private String resolveEncoding(PDFont font) {
        if (font == null) {
            return null;
        }
        COSDictionary dictionary = font.getCOSObject();
        if (dictionary == null) {
            return null;
        }
        COSBase encoding = dictionary.getDictionaryObject(COSName.ENCODING);
        if (encoding instanceof COSName name) {
            return name.getName();
        }
        if (encoding instanceof COSDictionary encodingDictionary) {
            return encodingDictionary.getNameAsString(COSName.BASE_ENCODING);
        }
        return null;
    }

    private String resolveStandard14Name(PDFont font) {
        if (font == null) {
            return null;
        }
        try {
            Standard14Fonts.FontName mapped = Standard14Fonts.getMappedFontName(font.getName());
            return mapped != null ? mapped.getName() : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private List<PdfJsonPage> extractPages(
            PDDocument document, Map<Integer, List<PdfJsonTextElement>> textByPage)
            throws IOException {
        List<PdfJsonPage> pages = new ArrayList<>();
        int pageIndex = 0;
        for (PDPage page : document.getPages()) {
            PdfJsonPage pageModel = new PdfJsonPage();
            pageModel.setPageNumber(pageIndex + 1);
            PDRectangle mediaBox = page.getMediaBox();
            pageModel.setWidth(mediaBox.getWidth());
            pageModel.setHeight(mediaBox.getHeight());
            pageModel.setRotation(page.getRotation());
            pageModel.setTextElements(textByPage.getOrDefault(pageIndex + 1, new ArrayList<>()));
            pageModel.setResources(
                    serializeCosValue(page.getCOSObject().getDictionaryObject(COSName.RESOURCES)));
            pageModel.setContentStreams(extractContentStreams(page));
            pages.add(pageModel);
            pageIndex++;
        }
        return pages;
    }

    private PdfJsonMetadata extractMetadata(PDDocument document) {
        PdfJsonMetadata metadata = new PdfJsonMetadata();
        PDDocumentInformation info = document.getDocumentInformation();
        if (info != null) {
            metadata.setTitle(info.getTitle());
            metadata.setAuthor(info.getAuthor());
            metadata.setSubject(info.getSubject());
            metadata.setKeywords(info.getKeywords());
            metadata.setCreator(info.getCreator());
            metadata.setProducer(info.getProducer());
            metadata.setCreationDate(formatCalendar(info.getCreationDate()));
            metadata.setModificationDate(formatCalendar(info.getModificationDate()));
            metadata.setTrapped(info.getTrapped());
        }
        metadata.setNumberOfPages(document.getNumberOfPages());
        return metadata;
    }

    private String extractXmpMetadata(PDDocument document) {
        if (document.getDocumentCatalog() == null) {
            return null;
        }
        PDMetadata metadata = document.getDocumentCatalog().getMetadata();
        if (metadata == null) {
            return null;
        }
        try (InputStream inputStream = metadata.createInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            inputStream.transferTo(baos);
            byte[] data = baos.toByteArray();
            if (data.length == 0) {
                return null;
            }
            return Base64.getEncoder().encodeToString(data);
        } catch (IOException ex) {
            log.debug("Failed to extract XMP metadata: {}", ex.getMessage());
            return null;
        }
    }

    private void applyMetadata(PDDocument document, PdfJsonMetadata metadata) {
        if (metadata == null) {
            return;
        }
        PDDocumentInformation info = document.getDocumentInformation();
        info.setTitle(metadata.getTitle());
        info.setAuthor(metadata.getAuthor());
        info.setSubject(metadata.getSubject());
        info.setKeywords(metadata.getKeywords());
        info.setCreator(metadata.getCreator());
        info.setProducer(metadata.getProducer());
        if (metadata.getCreationDate() != null) {
            parseInstant(metadata.getCreationDate())
                    .ifPresent(instant -> info.setCreationDate(toCalendar(instant)));
        }
        if (metadata.getModificationDate() != null) {
            parseInstant(metadata.getModificationDate())
                    .ifPresent(instant -> info.setModificationDate(toCalendar(instant)));
        }
        info.setTrapped(metadata.getTrapped());
    }

    private void applyXmpMetadata(PDDocument document, String base64) {
        if (base64 == null || base64.isBlank()) {
            return;
        }
        try (InputStream inputStream =
                new ByteArrayInputStream(Base64.getDecoder().decode(base64))) {
            PDMetadata metadata = new PDMetadata(document, inputStream);
            document.getDocumentCatalog().setMetadata(metadata);
        } catch (IllegalArgumentException | IOException ex) {
            log.debug("Failed to apply XMP metadata: {}", ex.getMessage());
        }
    }

    private void applyPageResources(
            PDDocument document, PDPage page, PdfJsonCosValue resourcesModel) throws IOException {
        if (resourcesModel == null) {
            return;
        }
        COSBase base = deserializeCosValue(resourcesModel, document);
        if (base instanceof COSDictionary dictionary) {
            page.setResources(new PDResources(dictionary));
        }
    }

    private List<PDStream> buildContentStreams(
            PDDocument document, List<PdfJsonStream> streamModels) throws IOException {
        List<PDStream> streams = new ArrayList<>();
        if (streamModels == null) {
            return streams;
        }
        for (PdfJsonStream streamModel : streamModels) {
            if (streamModel == null) {
                continue;
            }
            COSStream cosStream = buildStreamFromModel(streamModel, document);
            if (cosStream != null) {
                streams.add(new PDStream(cosStream));
            }
        }
        return streams;
    }

    private List<PdfJsonStream> extractContentStreams(PDPage page) throws IOException {
        List<PdfJsonStream> streams = new ArrayList<>();
        Iterator<PDStream> iterator = page.getContentStreams();
        if (iterator == null) {
            return streams;
        }
        while (iterator.hasNext()) {
            PDStream stream = iterator.next();
            PdfJsonStream model = serializeStream(stream);
            if (model != null) {
                streams.add(model);
            }
        }
        return streams;
    }

    private COSStream buildStreamFromModel(PdfJsonStream streamModel, PDDocument document)
            throws IOException {
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

    private PdfJsonStream serializeStream(PDStream stream) throws IOException {
        if (stream == null) {
            return null;
        }
        return serializeStream(stream.getCOSObject());
    }

    private PdfJsonStream serializeStream(COSStream cosStream) throws IOException {
        if (cosStream == null) {
            return null;
        }
        Map<String, PdfJsonCosValue> dictionary = new LinkedHashMap<>();
        for (COSName key : cosStream.keySet()) {
            COSBase value = cosStream.getDictionaryObject(key);
            PdfJsonCosValue serialized = serializeCosValue(value);
            if (serialized != null) {
                dictionary.put(key.getName(), serialized);
            }
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

    private PdfJsonCosValue serializeCosValue(COSBase base) throws IOException {
        if (base == null) {
            return null;
        }
        if (base instanceof COSObject cosObject) {
            base = cosObject.getObject();
            if (base == null) {
                return null;
            }
        }
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
                PdfJsonCosValue serialized = serializeCosValue(item);
                items.add(serialized);
            }
            builder.type(PdfJsonCosValue.Type.ARRAY).items(items);
            return builder.build();
        }
        if (base instanceof COSStream stream) {
            builder.type(PdfJsonCosValue.Type.STREAM).stream(serializeStream(stream));
            return builder.build();
        }
        if (base instanceof COSDictionary dictionary) {
            Map<String, PdfJsonCosValue> entries = new LinkedHashMap<>();
            for (COSName key : dictionary.keySet()) {
                PdfJsonCosValue serialized = serializeCosValue(dictionary.getDictionaryObject(key));
                entries.put(key.getName(), serialized);
            }
            builder.type(PdfJsonCosValue.Type.DICTIONARY).entries(entries);
            return builder.build();
        }
        return null;
    }

    private COSBase deserializeCosValue(PdfJsonCosValue value, PDDocument document)
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

    private void regenerateTextContent(
            PDDocument document,
            PDPage page,
            List<PdfJsonTextElement> elements,
            Map<String, PDFont> fontMap,
            int pageNumber)
            throws IOException {
        try (PDPageContentStream contentStream =
                new PDPageContentStream(document, page, AppendMode.OVERWRITE, true, true)) {
            boolean textOpen = false;
            for (PdfJsonTextElement element : elements) {
                PDFont font = fontMap.get(buildFontKey(pageNumber, element.getFontId()));
                if (font == null && FALLBACK_FONT_ID.equals(element.getFontId())) {
                    font = fontMap.get(buildFontKey(-1, FALLBACK_FONT_ID));
                }
                float fontScale = safeFloat(element.getFontMatrixSize(), 0f);
                if (fontScale == 0f) {
                    fontScale = safeFloat(element.getFontSize(), 12f);
                }
                String text = Objects.toString(element.getText(), "");

                if (font != null) {
                    try {
                        encodeWithTest(font, text);
                    } catch (IOException | IllegalArgumentException ex) {
                        log.debug(
                                "Edited text contains glyphs missing from font {} ({}), switching to fallback",
                                element.getFontId(),
                                ex.getMessage());
                        font = fontMap.get(buildFontKey(-1, FALLBACK_FONT_ID));
                        element.setFontId(FALLBACK_FONT_ID);
                        if (font == null) {
                            font = loadFallbackPdfFont(document);
                            fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), font);
                        }
                        encodeWithTest(font, text);
                    }
                } else {
                    element.setFontId(FALLBACK_FONT_ID);
                    font = fontMap.get(buildFontKey(-1, FALLBACK_FONT_ID));
                    if (font == null) {
                        font = loadFallbackPdfFont(document);
                        fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), font);
                    }
                    encodeWithTest(font, text);
                }

                if (!textOpen) {
                    contentStream.beginText();
                    textOpen = true;
                }

                contentStream.setFont(font, fontScale);
                applyRenderingMode(contentStream, element.getRenderingMode());
                applyTextMatrix(contentStream, element);
                contentStream.showText(text);
            }
            if (textOpen) {
                contentStream.endText();
            }
        }
    }

    private void encodeWithTest(PDFont font, String text) throws IOException {
        if (text == null || text.isEmpty()) {
            return;
        }
        font.encode(text);
    }

    private String abbreviate(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.replaceAll("\s+", " ").trim();
        if (trimmed.length() <= 32) {
            return trimmed;
        }
        return trimmed.substring(0, 29) + "...";
    }

    private static class FontProgramData {
        private final String base64;
        private final String format;

        private FontProgramData(String base64, String format) {
            this.base64 = base64;
            this.format = format;
        }

        private String getBase64() {
            return base64;
        }

        private String getFormat() {
            return format;
        }
    }

    private boolean rewriteTextOperators(
            PDDocument document, PDPage page, List<PdfJsonTextElement> elements) {
        if (elements == null || elements.isEmpty()) {
            return true;
        }
        PDResources resources = page.getResources();
        if (resources == null) {
            return false;
        }
        try {
            log.debug("Attempting token-level rewrite for page");
            PDFStreamParser parser = new PDFStreamParser(page);
            List<Object> tokens = parser.parse();
            log.debug("Parsed {} tokens for rewrite", tokens.size());
            TextElementCursor cursor = new TextElementCursor(elements);
            PDFont currentFont = null;
            String currentFontName = null;

            for (int i = 0; i < tokens.size(); i++) {
                Object token = tokens.get(i);
                if (!(token instanceof Operator operator)) {
                    continue;
                }
                String operatorName = operator.getName();
                switch (operatorName) {
                    case "Tf":
                        if (i >= 2 && tokens.get(i - 2) instanceof COSName fontResourceName) {
                            currentFont = resources.getFont(fontResourceName);
                            currentFontName = fontResourceName.getName();
                            log.trace(
                                    "Encountered Tf operator; switching to font resource {}",
                                    currentFontName);
                        } else {
                            currentFont = null;
                            currentFontName = null;
                            log.debug(
                                    "Tf operator missing resource operand; clearing current font");
                        }
                        break;
                    case "Tj":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSString cosString)) {
                            log.debug(
                                    "Encountered Tj without preceding string operand; aborting rewrite");
                            return false;
                        }
                        log.trace("Rewriting Tj operator using font {}", currentFontName);
                        if (!rewriteShowText(cosString, currentFont, currentFontName, cursor)) {
                            log.debug("Failed to rewrite Tj operator; aborting rewrite");
                            return false;
                        }
                        break;
                    case "TJ":
                        if (i == 0 || !(tokens.get(i - 1) instanceof COSArray array)) {
                            log.debug("Encountered TJ without array operand; aborting rewrite");
                            return false;
                        }
                        log.trace("Rewriting TJ operator using font {}", currentFontName);
                        if (!rewriteShowTextArray(array, currentFont, currentFontName, cursor)) {
                            log.debug("Failed to rewrite TJ operator; aborting rewrite");
                            return false;
                        }
                        break;
                    default:
                        break;
                }
            }

            if (cursor.hasRemaining()) {
                log.debug("Rewrite cursor still has {} elements; falling back", cursor.remaining());
                return false;
            }

            PDStream newStream = new PDStream(document);
            try (OutputStream outputStream = newStream.createOutputStream(COSName.FLATE_DECODE)) {
                new ContentStreamWriter(outputStream).writeTokens(tokens);
            }
            page.setContents(newStream);
            log.debug("Token rewrite completed successfully");
            return true;
        } catch (IOException ex) {
            log.debug("Failed to rewrite content stream: {}", ex.getMessage());
            return false;
        }
    }

    private boolean rewriteShowText(
            COSString cosString, PDFont font, String expectedFontName, TextElementCursor cursor)
            throws IOException {
        if (font == null) {
            return false;
        }
        int glyphCount = countGlyphs(cosString, font);
        List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
        if (consumed == null) {
            return false;
        }
        String replacement = mergeText(consumed);
        try {
            byte[] encoded = font.encode(replacement);
            cosString.setValue(encoded);
            return true;
        } catch (IOException | IllegalArgumentException ex) {
            log.debug("Failed to encode replacement text: {}", ex.getMessage());
            return false;
        }
    }

    private boolean rewriteShowTextArray(
            COSArray array, PDFont font, String expectedFontName, TextElementCursor cursor)
            throws IOException {
        if (font == null) {
            return false;
        }
        for (int i = 0; i < array.size(); i++) {
            COSBase element = array.get(i);
            if (element instanceof COSString cosString) {
                int glyphCount = countGlyphs(cosString, font);
                List<PdfJsonTextElement> consumed = cursor.consume(expectedFontName, glyphCount);
                if (consumed == null) {
                    return false;
                }
                String replacement = mergeText(consumed);
                try {
                    byte[] encoded = font.encode(replacement);
                    array.set(i, new COSString(encoded));
                } catch (IOException | IllegalArgumentException ex) {
                    log.debug("Failed to encode replacement text in TJ array: {}", ex.getMessage());
                    return false;
                }
            }
        }
        return true;
    }

    private int countGlyphs(COSString value, PDFont font) {
        if (value == null) {
            return 0;
        }
        if (font != null) {
            try (InputStream inputStream = new ByteArrayInputStream(value.getBytes())) {
                int count = 0;
                int code;
                while ((code = font.readCode(inputStream)) != -1) {
                    count++;
                }
                if (count > 0) {
                    return count;
                }
            } catch (IOException ex) {
                log.debug("Failed to decode glyphs: {}", ex.getMessage());
            }
        }
        byte[] bytes = value.getBytes();
        return Math.max(1, bytes.length);
    }

    private String mergeText(List<PdfJsonTextElement> elements) {
        StringBuilder builder = new StringBuilder();
        for (PdfJsonTextElement element : elements) {
            builder.append(Objects.toString(element.getText(), ""));
        }
        return builder.toString();
    }

    private static class TextElementCursor {
        private final List<PdfJsonTextElement> elements;
        private int index = 0;

        TextElementCursor(List<PdfJsonTextElement> elements) {
            this.elements = elements;
        }

        boolean hasRemaining() {
            return index < elements.size();
        }

        int remaining() {
            return Math.max(0, elements.size() - index);
        }

        List<PdfJsonTextElement> consume(String expectedFontName, int glyphCount) {
            if (glyphCount <= 0) {
                return Collections.emptyList();
            }
            List<PdfJsonTextElement> consumed = new ArrayList<>();
            int remaining = glyphCount;
            while (remaining > 0 && index < elements.size()) {
                PdfJsonTextElement element = elements.get(index);
                if (!fontMatches(expectedFontName, element.getFontId())) {
                    return null;
                }
                consumed.add(element);
                remaining -= countGlyphs(element);
                index++;
            }
            if (remaining > 0) {
                return null;
            }
            return consumed;
        }

        private boolean fontMatches(String expected, String actual) {
            if (expected == null || expected.isEmpty()) {
                return true;
            }
            if (actual == null) {
                return false;
            }
            return Objects.equals(expected, actual);
        }

        private int countGlyphs(PdfJsonTextElement element) {
            String text = element.getText();
            if (text != null && !text.isEmpty()) {
                return Math.max(1, text.codePointCount(0, text.length()));
            }
            return 1;
        }
    }

    private Map<String, PDFont> buildFontMap(PDDocument document, List<PdfJsonFont> fonts)
            throws IOException {
        Map<String, PDFont> fontMap = new HashMap<>();
        if (fonts != null) {
            for (PdfJsonFont fontModel : fonts) {
                if (FALLBACK_FONT_ID.equals(fontModel.getId())) {
                    continue;
                }
                PDFont loadedFont = createFontFromModel(document, fontModel);
                if (loadedFont != null && fontModel.getId() != null) {
                    fontMap.put(
                            buildFontKey(fontModel.getPageNumber(), fontModel.getId()), loadedFont);
                }
            }
        }

        boolean fallbackPresent =
                fonts != null && fonts.stream().anyMatch(f -> FALLBACK_FONT_ID.equals(f.getId()));
        if (!fallbackPresent) {
            PdfJsonFont fallbackModel = buildFallbackFontModel();
            if (fonts != null) {
                fonts.add(fallbackModel);
                log.info("Added fallback font definition to JSON font list");
            }
            PDFont fallbackFont = createFontFromModel(document, fallbackModel);
            fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), fallbackFont);
        } else if (!fontMap.containsKey(buildFontKey(-1, FALLBACK_FONT_ID))) {
            PdfJsonFont fallbackModel =
                    fonts.stream()
                            .filter(f -> FALLBACK_FONT_ID.equals(f.getId()))
                            .findFirst()
                            .orElse(buildFallbackFontModel());
            PDFont fallbackFont = createFontFromModel(document, fallbackModel);
            fontMap.put(buildFontKey(-1, FALLBACK_FONT_ID), fallbackFont);
        }

        return fontMap;
    }

    private PDFont createFontFromModel(PDDocument document, PdfJsonFont fontModel)
            throws IOException {
        if (fontModel == null || fontModel.getId() == null) {
            return null;
        }

        if (FALLBACK_FONT_ID.equals(fontModel.getId())) {
            return loadFallbackPdfFont(document);
        }

        String program = fontModel.getProgram();
        if (program != null && !program.isBlank()) {
            byte[] fontBytes = Base64.getDecoder().decode(program);
            String format =
                    fontModel.getProgramFormat() != null
                            ? fontModel.getProgramFormat().toLowerCase(Locale.ROOT)
                            : "";
            try {
                if (isType1Format(format)) {
                    try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                        PDFont font = new PDType1Font(document, stream);
                        applyAdditionalFontMetadata(document, font, fontModel);
                        return font;
                    }
                }
                try (InputStream stream = new ByteArrayInputStream(fontBytes)) {
                    PDFont font = PDType0Font.load(document, stream, true);
                    applyAdditionalFontMetadata(document, font, fontModel);
                    return font;
                }
            } catch (IOException ex) {
                log.debug(
                        "Unable to load embedded font program for {}: {}",
                        fontModel.getId(),
                        ex.getMessage());
            }
        }

        String standardName = fontModel.getStandard14Name();
        if (standardName != null) {
            try {
                Standard14Fonts.FontName fontName = Standard14Fonts.getMappedFontName(standardName);
                if (fontName != null) {
                    PDFont font = new PDType1Font(fontName);
                    applyAdditionalFontMetadata(document, font, fontModel);
                    return font;
                }
                log.warn(
                        "Standard 14 font mapping for {} returned null, using fallback",
                        standardName);
            } catch (IllegalArgumentException ex) {
                log.warn("Unknown Standard 14 font {}, using fallback", standardName);
            }
        }

        PDFont fallback = loadFallbackPdfFont(document);
        applyAdditionalFontMetadata(document, fallback, fontModel);
        return fallback;
    }

    private boolean isType1Format(String format) {
        if (format == null) {
            return false;
        }
        return "type1".equals(format) || format.endsWith("pfb");
    }

    private void applyAdditionalFontMetadata(
            PDDocument document, PDFont font, PdfJsonFont fontModel) throws IOException {
        if (fontModel.getToUnicode() != null && !fontModel.getToUnicode().isBlank()) {
            byte[] bytes = Base64.getDecoder().decode(fontModel.getToUnicode());
            PDStream toUnicodeStream = new PDStream(document);
            try (OutputStream outputStream = toUnicodeStream.createOutputStream()) {
                outputStream.write(bytes);
            }
            font.getCOSObject().setItem(COSName.TO_UNICODE, toUnicodeStream.getCOSObject());
        }

        PdfJsonFontCidSystemInfo cidInfo = fontModel.getCidSystemInfo();
        if (cidInfo != null) {
            COSDictionary cidDictionary = new COSDictionary();
            if (cidInfo.getRegistry() != null) {
                cidDictionary.setString(COSName.REGISTRY, cidInfo.getRegistry());
            }
            if (cidInfo.getOrdering() != null) {
                cidDictionary.setString(COSName.ORDERING, cidInfo.getOrdering());
            }
            if (cidInfo.getSupplement() != null) {
                cidDictionary.setInt(COSName.SUPPLEMENT, cidInfo.getSupplement());
            }
            font.getCOSObject().setItem(COSName.CIDSYSTEMINFO, cidDictionary);
        }
    }

    private void applyTextMatrix(PDPageContentStream contentStream, PdfJsonTextElement element)
            throws IOException {
        List<Float> matrix = element.getTextMatrix();
        if (matrix != null && matrix.size() == 6) {
            float fontScale = safeFloat(element.getFontMatrixSize(), 0f);
            if (fontScale == 0f) {
                fontScale = safeFloat(element.getFontSize(), 1f);
            }
            float a = matrix.get(0);
            float b = matrix.get(1);
            float c = matrix.get(2);
            float d = matrix.get(3);
            float e = matrix.get(4);
            float f = matrix.get(5);

            if (fontScale != 0f) {
                a /= fontScale;
                b /= fontScale;
                c /= fontScale;
                d /= fontScale;
            }

            contentStream.setTextMatrix(new Matrix(a, b, c, d, e, f));
            return;
        }
        float x = safeFloat(element.getX(), 0f);
        float y = safeFloat(element.getY(), 0f);
        contentStream.setTextMatrix(new Matrix(1, 0, 0, 1, x, y));
    }

    private void applyRenderingMode(PDPageContentStream contentStream, Integer renderingMode)
            throws IOException {
        if (renderingMode == null) {
            return;
        }
        RenderingMode mode = toRenderingMode(renderingMode);
        if (mode == null) {
            log.debug("Ignoring unsupported rendering mode {}", renderingMode);
            return;
        }
        try {
            contentStream.setRenderingMode(mode);
        } catch (IllegalArgumentException ex) {
            log.debug("Failed to apply rendering mode {}: {}", renderingMode, ex.getMessage());
        }
    }

    private float safeFloat(Float value, float defaultValue) {
        if (value == null || Float.isNaN(value) || Float.isInfinite(value)) {
            return defaultValue;
        }
        return value;
    }

    private String formatCalendar(Calendar calendar) {
        if (calendar == null) {
            return null;
        }
        return calendar.toInstant().toString();
    }

    private Optional<Instant> parseInstant(String value) {
        try {
            return Optional.of(Instant.parse(value));
        } catch (DateTimeParseException ex) {
            log.warn("Failed to parse instant '{}': {}", value, ex.getMessage());
            return Optional.empty();
        }
    }

    private Calendar toCalendar(Instant instant) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        calendar.setTimeInMillis(instant.toEpochMilli());
        return calendar;
    }

    private class TextCollectingStripper extends PDFTextStripper {

        private final PDDocument document;
        private final Map<String, PdfJsonFont> fonts;
        private final Map<Integer, List<PdfJsonTextElement>> textByPage;
        private final Map<Integer, Map<PDFont, String>> pageFontResources;

        private int currentPage = 1;
        private Map<PDFont, String> currentFontResources = Collections.emptyMap();

        TextCollectingStripper(
                PDDocument document,
                Map<String, PdfJsonFont> fonts,
                Map<Integer, List<PdfJsonTextElement>> textByPage,
                Map<Integer, Map<PDFont, String>> pageFontResources)
                throws IOException {
            this.document = document;
            this.fonts = fonts;
            this.textByPage = textByPage;
            this.pageFontResources = pageFontResources;
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            super.startPage(page);
            currentPage = getCurrentPageNo();
            currentFontResources =
                    pageFontResources.getOrDefault(currentPage, Collections.emptyMap());
        }

        @Override
        protected void writeString(String text, List<TextPosition> textPositions)
                throws IOException {
            if (textPositions == null || textPositions.isEmpty()) {
                return;
            }
            List<PdfJsonTextElement> pageElements =
                    textByPage.computeIfAbsent(currentPage, key -> new ArrayList<>());

            for (TextPosition position : textPositions) {
                PDFont font = position.getFont();
                String fontId = registerFont(font);
                PdfJsonTextElement element = new PdfJsonTextElement();
                element.setText(position.getUnicode());
                element.setFontId(fontId);
                element.setFontSize(position.getFontSizeInPt());
                element.setFontMatrixSize(position.getFontSize());
                element.setX(position.getXDirAdj());
                element.setY(position.getYDirAdj());
                element.setWidth(position.getWidthDirAdj());
                element.setHeight(position.getHeightDir());
                element.setTextMatrix(extractMatrix(position));
                pageElements.add(element);
            }
        }

        private List<Float> extractMatrix(TextPosition position) {
            float[] values = new float[6];
            values[0] = position.getTextMatrix().getValue(0, 0);
            values[1] = position.getTextMatrix().getValue(0, 1);
            values[2] = position.getTextMatrix().getValue(1, 0);
            values[3] = position.getTextMatrix().getValue(1, 1);
            values[4] = position.getTextMatrix().getValue(2, 0);
            values[5] = position.getTextMatrix().getValue(2, 1);
            List<Float> matrix = new ArrayList<>(6);
            for (float value : values) {
                matrix.add(value);
            }
            return matrix;
        }

        private String registerFont(PDFont font) throws IOException {
            String fontId = currentFontResources.get(font);
            if (fontId == null || fontId.isBlank()) {
                fontId = font.getName();
            }
            String key = buildFontKey(currentPage, fontId);
            if (!fonts.containsKey(key)) {
                fonts.put(key, buildFontModel(document, font, fontId, currentPage));
            }
            return fontId;
        }
    }

    private RenderingMode toRenderingMode(Integer renderingMode) {
        if (renderingMode == null) {
            return null;
        }
        switch (renderingMode) {
            case 0:
                return RenderingMode.FILL;
            case 1:
                return RenderingMode.STROKE;
            case 2:
                return RenderingMode.FILL_STROKE;
            case 3:
                return RenderingMode.NEITHER;
            case 4:
                return RenderingMode.FILL_CLIP;
            case 5:
                return RenderingMode.STROKE_CLIP;
            case 6:
                return RenderingMode.FILL_STROKE_CLIP;
            case 7:
                return RenderingMode.NEITHER_CLIP;
            default:
                return null;
        }
    }
}
