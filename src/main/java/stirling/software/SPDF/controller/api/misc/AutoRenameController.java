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

import io.github.pixee.security.Filenames;
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
    private static final int LINE_LIMIT = 11;

    @PostMapping(consumes = "multipart/form-data", value = "/auto-rename")
    @Operation(
            summary = "Extract header from PDF file",
            description =
                    "This endpoint accepts a PDF file and attempts to extract its title or header based on heuristics. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> extractHeader(@ModelAttribute ExtractHeaderRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        Boolean useFirstTextAsFallback = request.isUseFirstTextAsFallback();

        PDDocument document = Loader.loadPDF(file.getBytes());
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
                        if (lastY != text.getY() && lineCount < LINE_LIMIT) {
                            processLine();
                            lineBuilder = new StringBuilder(text.getUnicode());
                            maxFontSizeInLine = text.getFontSizeInPt();
                            lastY = text.getY();
                            lineCount++;
                        } else if (lineCount < LINE_LIMIT) {
                            lineBuilder.append(text.getUnicode());
                            if (text.getFontSizeInPt() > maxFontSizeInLine) {
                                maxFontSizeInLine = text.getFontSizeInPt();
                            }
                        }
                    }

                    private void processLine() {
                        if (lineBuilder.length() > 0 && lineCount < LINE_LIMIT) {
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

        String header = reader.getText(document);

        // Sanitize the header string by removing characters not allowed in a filename.
        if (header != null && header.length() < 255) {
            header = header.replaceAll("[/\\\\?%*:|\"<>]", "").trim();
            return WebResponseUtils.pdfDocToWebResponse(document, header + ".pdf");
        } else {
            logger.info("File has no good title to be found");
            return WebResponseUtils.pdfDocToWebResponse(
                    document, Filenames.toSimpleFileName(file.getOriginalFilename()));
        }
    }
}
