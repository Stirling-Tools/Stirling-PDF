package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TimeZone;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.Matrix;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class PdfJsonConversionService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    public byte[] convertPdfToJson(MultipartFile file) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }
        try (PDDocument document = pdfDocumentFactory.load(file.getInputStream(), true)) {
            Map<String, PdfJsonFont> fonts = new LinkedHashMap<>();
            Map<Integer, List<PdfJsonTextElement>> textByPage = new LinkedHashMap<>();

            TextCollectingStripper stripper = new TextCollectingStripper(fonts, textByPage);
            stripper.setSortByPosition(true);
            stripper.getText(document);

            PdfJsonDocument pdfJson = new PdfJsonDocument();
            pdfJson.setMetadata(extractMetadata(document));
            pdfJson.setFonts(new ArrayList<>(fonts.values()));
            pdfJson.setPages(extractPages(document, textByPage));

            return objectMapper
                    .writerWithDefaultPrettyPrinter()
                    .writeValueAsBytes(pdfJson);
        }
    }

    public byte[] convertJsonToPdf(MultipartFile file) throws IOException {
        if (file == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }
        byte[] jsonBytes = file.getBytes();
        PdfJsonDocument pdfJson =
                objectMapper.readValue(jsonBytes, PdfJsonDocument.class);

        try (PDDocument document = new PDDocument()) {
            applyMetadata(document, pdfJson.getMetadata());

            Map<String, PDFont> fontMap = buildFontMap(document, pdfJson.getFonts());
            PDFont defaultFont = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

            List<PdfJsonPage> pages = pdfJson.getPages();
            if (pages == null) {
                pages = new ArrayList<>();
            }

            for (PdfJsonPage pageModel : pages) {
                PDRectangle pageSize =
                        new PDRectangle(
                                safeFloat(pageModel.getWidth(), 612f),
                                safeFloat(pageModel.getHeight(), 792f));
                PDPage page = new PDPage(pageSize);
                if (pageModel.getRotation() != null) {
                    page.setRotation(pageModel.getRotation());
                }
                document.addPage(page);

                List<PdfJsonTextElement> elements = pageModel.getTextElements();
                if (elements == null || elements.isEmpty()) {
                    continue;
                }

                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                document,
                                page,
                                AppendMode.APPEND,
                                true,
                                true)) {
                    contentStream.beginText();
                    for (PdfJsonTextElement element : elements) {
                        PDFont font = fontMap.getOrDefault(element.getFontId(), defaultFont);
                        float fontSize = safeFloat(element.getFontSize(), 12f);
                        contentStream.setFont(font, fontSize);
                        applyRenderingMode(contentStream, element.getRenderingMode());
                        applyTextMatrix(contentStream, element);
                        try {
                            contentStream.showText(Objects.toString(element.getText(), ""));
                        } catch (IllegalArgumentException ex) {
                            log.debug(
                                    "Falling back to default font for text element due to encoding issue: {}",
                                    ex.getMessage());
                            contentStream.setFont(defaultFont, fontSize);
                            contentStream.showText(Objects.toString(element.getText(), ""));
                        }
                    }
                    contentStream.endText();
                }
            }

            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                return baos.toByteArray();
            }
        }
    }

    private List<PdfJsonPage> extractPages(
            PDDocument document, Map<Integer, List<PdfJsonTextElement>> textByPage) {
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

    private Map<String, PDFont> buildFontMap(PDDocument document, List<PdfJsonFont> fonts)
            throws IOException {
        Map<String, PDFont> fontMap = new HashMap<>();
        if (fonts == null) {
            return fontMap;
        }
        for (PdfJsonFont fontModel : fonts) {
            PDFont font = createFontFromModel(document, fontModel);
            if (font != null && fontModel.getId() != null) {
                fontMap.put(fontModel.getId(), font);
            }
        }
        return fontMap;
    }

    private PDFont createFontFromModel(PDDocument document, PdfJsonFont fontModel)
            throws IOException {
        if (fontModel == null) {
            return null;
        }
        String base64 = fontModel.getBase64Data();
        if (base64 != null && !base64.isBlank()) {
            byte[] fontBytes = Base64.getDecoder().decode(base64);
            try (InputStream fontStream = new ByteArrayInputStream(fontBytes)) {
                return PDType0Font.load(document, fontStream, true);
            } catch (IOException ex) {
                log.debug(
                        "Unable to load font as Type0 ({}): {}",
                        fontModel.getName(),
                        ex.getMessage());
            }
        }
        String standardName = fontModel.getStandard14Name();
        if (standardName != null) {
            try {
                Standard14Fonts.FontName fontName =
                        Standard14Fonts.getMappedFontName(standardName);
                return new PDType1Font(fontName);
            } catch (IllegalArgumentException ex) {
                log.warn("Unknown Standard 14 font {}, using Helvetica", standardName);
            }
        }
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    private void applyTextMatrix(PDPageContentStream contentStream, PdfJsonTextElement element)
            throws IOException {
        List<Float> matrix = element.getTextMatrix();
        if (matrix != null && matrix.size() == 6) {
            contentStream.setTextMatrix(
                    new Matrix(
                            matrix.get(0),
                            matrix.get(1),
                            matrix.get(2),
                            matrix.get(3),
                            matrix.get(4),
                            matrix.get(5)));
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
            log.debug(
                    "Failed to apply rendering mode {}: {}", renderingMode, ex.getMessage());
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

        private final Map<String, PdfJsonFont> fonts;
        private final Map<Integer, List<PdfJsonTextElement>> textByPage;
        private int currentPage = 1;

        TextCollectingStripper(
                Map<String, PdfJsonFont> fonts, Map<Integer, List<PdfJsonTextElement>> textByPage)
                throws IOException {
            this.fonts = fonts;
            this.textByPage = textByPage;
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            super.startPage(page);
            currentPage = getCurrentPageNo();
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
            String id = font.getName();
            if (!fonts.containsKey(id)) {
                PdfJsonFont fontModel = new PdfJsonFont();
                fontModel.setId(id);
                fontModel.setName(font.getName());
                fontModel.setSubtype(resolveSubtype(font));
                fontModel.setEncoding(resolveEncoding(font));
                fontModel.setEmbedded(!isStandard14Font(font));
                fontModel.setStandard14Name(resolveStandard14Name(font));
                fontModel.setFontDescriptorFlags(
                        font.getFontDescriptor() != null
                                ? font.getFontDescriptor().getFlags()
                                : null);
                fontModel.setBase64Data(extractFontData(font));
                fonts.put(id, fontModel);
            }
            return id;
        }

        private String resolveStandard14Name(PDFont font) {
            if (font == null) {
                return null;
            }
            if (isStandard14Font(font)) {
                return font.getName();
            }
            try {
                Standard14Fonts.FontName mapped =
                        Standard14Fonts.getMappedFontName(font.getName());
                return mapped.getName();
            } catch (IllegalArgumentException ex) {
                return null;
            }
        }

        private String extractFontData(PDFont font) throws IOException {
            if (font == null || isStandard14Font(font)) {
                return null;
            }
            PDFontDescriptor descriptor = font.getFontDescriptor();
            if (descriptor == null) {
                return null;
            }
            org.apache.pdfbox.pdmodel.common.PDStream fontStream = descriptor.getFontFile();
            if (fontStream == null) {
                fontStream = descriptor.getFontFile2();
            }
            if (fontStream == null) {
                fontStream = descriptor.getFontFile3();
            }
            if (fontStream == null) {
                return null;
            }
            try (InputStream inputStream = fontStream.createInputStream();
                    ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                inputStream.transferTo(baos);
                return Base64.getEncoder().encodeToString(baos.toByteArray());
            }
        }

        private String resolveSubtype(PDFont font) {
            if (font == null) {
                return null;
            }
            COSDictionary dictionary = font.getCOSObject();
            return dictionary != null ? dictionary.getNameAsString(COSName.SUBTYPE) : null;
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
            if (encoding instanceof COSName) {
                return ((COSName) encoding).getName();
            }
            if (encoding instanceof COSDictionary) {
                return ((COSDictionary) encoding).getNameAsString(COSName.BASE_ENCODING);
            }
            return null;
        }

        private boolean isStandard14Font(PDFont font) {
            if (font == null) {
                return false;
            }
            try {
                Standard14Fonts.getMappedFontName(font.getName());
                return true;
            } catch (IllegalArgumentException ex) {
                return false;
            }
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
