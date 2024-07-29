package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.ExtractHeaderRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class AutoRenameController {

    private static final Logger logger = LoggerFactory.getLogger(AutoRenameController.class);

    private static final float TITLE_FONT_SIZE_THRESHOLD = 20.0f;
    private static final int DEFAULT_LINE_LIMIT = 11;

    @PostMapping(consumes = "multipart/form-data", value = "/auto-rename")
    @Operation(
            summary = "Extract header from PDF file or Auto rename ",
            description =
                    "This endpoint accepts a PDF file and attempts to rename it based on various methods. Based on keyword or else extract its title or header based on heuristics. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> extractHeader(@ModelAttribute ExtractHeaderRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        Boolean useFirstTextAsFallback = request.isUseFirstTextAsFallback();

        String keyword = request.getKeyword();
        Boolean useAfter = request.getUseAfter();
        Integer linesToCheck =
                request.getLinesToCheck() != null ? request.getLinesToCheck() : DEFAULT_LINE_LIMIT;

        PDDocument document = Loader.loadPDF(file.getBytes());
        boolean check = keyword != null && !keyword.isEmpty();

        String newFileName;
        if (keyword != null && !keyword.isEmpty()) {
            newFileName = getTextByKeyword(document, keyword, useAfter, linesToCheck);
            if ("Untitled".equals(newFileName)) {
                newFileName =
                        extractHeaderUsingFontSize(document, useFirstTextAsFallback, linesToCheck);
            }
        } else {
            newFileName =
                    extractHeaderUsingFontSize(document, useFirstTextAsFallback, linesToCheck);
        }
        newFileName = sanitizeFileName(newFileName) + ".pdf";
        return WebResponseUtils.pdfDocToWebResponse(document, newFileName);
    }

    private String getTextByKeyword(
            PDDocument document, String keyword, Boolean useAfter, int linesToCheck)
            throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(1);
        stripper.setEndPage(1);
        String text = stripper.getText(document);

        String[] lines = text.split("\n");
        keyword = keyword.toLowerCase().trim();
        for (int i = 0; i < Math.min(linesToCheck, lines.length); i++) {
            String line = lines[i].trim();
            String lineLower = line.toLowerCase();
            if (lineLower.contains(keyword)) {
                if (useAfter) {
                    int index = lineLower.indexOf(keyword) + keyword.length();
                    String afterKeyword = line.substring(index).trim();
                    if (afterKeyword.isEmpty() || afterKeyword.equals(".")) {
                        if (i + 1 < lines.length) {
                            afterKeyword = lines[i + 1].trim();
                        }
                    }
                    if (afterKeyword.isEmpty() || afterKeyword.equals(".")) {
                        return "Untitled";
                    } else {
                        return afterKeyword;
                    }
                } else {
                    if (i + 1 < lines.length && !lines[i + 1].toLowerCase().contains(keyword)) {
                        String result = (line + " " + lines[i + 1].trim()).trim();
                        return result;
                    }
                    return line;
                }
            }
        }
        return "Untitled";
    }

    private String extractHeaderUsingFontSize(
            PDDocument document, Boolean useFirstTextAsFallback, int linesToCheck)
            throws IOException {
        PDFTextStripper reader =
                new PDFTextStripper() {
                    class LineInfo {
                        String text;
                        float fontSize;

                        LineInfo(String text, float fontSize) {
                            this.text = text;
                            this.fontSize = fontSize;
                        }
                    }

                    List<LineInfo> lineInfos = new ArrayList<>();
                    StringBuilder lineBuilder = new StringBuilder();
                    float lastY = -1;
                    float maxFontSizeInLine = 0.0f;
                    int lineCount = 0;

                    @Override
                    protected void processTextPosition(TextPosition text) {
                        if (lastY != text.getY() && lineCount < linesToCheck) {
                            processLine();
                            lineBuilder = new StringBuilder(text.getUnicode());
                            maxFontSizeInLine = text.getFontSizeInPt();
                            lastY = text.getY();
                            lineCount++;
                        } else if (lineCount < linesToCheck) {
                            lineBuilder.append(text.getUnicode());
                            if (text.getFontSizeInPt() > maxFontSizeInLine) {
                                maxFontSizeInLine = text.getFontSizeInPt();
                            }
                        }
                    }

                    private void processLine() {
                        if (lineBuilder.length() > 0 && lineCount < linesToCheck) {
                            lineInfos.add(new LineInfo(lineBuilder.toString(), maxFontSizeInLine));
                        }
                    }

                    @Override
                    public String getText(PDDocument doc) throws IOException {
                        this.lineInfos.clear();
                        this.lineBuilder = new StringBuilder();
                        this.lastY = -1;
                        this.maxFontSizeInLine = 0.0f;
                        this.lineCount = 0;
                        super.getText(doc);
                        processLine(); // Process the last line

                        // Merge lines with same font size
                        List<LineInfo> mergedLineInfos = new ArrayList<>();
                        for (int i = 0; i < lineInfos.size(); i++) {
                            String mergedText = lineInfos.get(i).text;
                            float fontSize = lineInfos.get(i).fontSize;
                            while (i + 1 < lineInfos.size()
                                    && lineInfos.get(i + 1).fontSize == fontSize) {
                                mergedText += " " + lineInfos.get(i + 1).text;
                                i++;
                            }
                            mergedLineInfos.add(new LineInfo(mergedText, fontSize));
                        }

                        // Sort lines by font size in descending order and get the first one
                        mergedLineInfos.sort(
                                Comparator.comparing((LineInfo li) -> li.fontSize).reversed());
                        String title =
                                mergedLineInfos.isEmpty() ? null : mergedLineInfos.get(0).text;

                        return title != null
                                ? title
                                : (useFirstTextAsFallback
                                        ? (mergedLineInfos.isEmpty()
                                                ? null
                                                : mergedLineInfos.get(mergedLineInfos.size() - 1)
                                                        .text)
                                        : null);
                    }
                };
        reader.setEndPage(1);

        String header = reader.getText(document);

        if (header != null && header.length() < 255) {
            return header.trim();
        } else {
            logger.info("File has no good title to be found");
            return "Untitled";
        }
    }

    private String sanitizeFileName(String fileName) {
        return fileName.replaceAll("[/\\\\?%*:|\"<>]", "").trim();
    }
}
