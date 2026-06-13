package stirling.software.SPDF.service.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.ExtractHeaderRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class AutoRenameServiceImpl implements AutoRenameService {

    // private static final float TITLE_FONT_SIZE_THRESHOLD = 20.0f;
    private static final int LINE_LIMIT = 200;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @Override
    public ResponseEntity<Resource> extractHeader(ExtractHeaderRequest request) throws IOException {

        MultipartFile file = request.getFileInput();
        boolean useFirstTextAsFallback = Boolean.TRUE.equals(request.getUseFirstTextAsFallback());

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDFTextStripper reader =
                    new PDFTextStripper() {
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
                            if (!lineBuilder.isEmpty() && lineCount < LINE_LIMIT) {
                                lineInfos.add(
                                        new LineInfo(lineBuilder.toString(), maxFontSizeInLine));
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
                                StringBuilder mergedText = new StringBuilder(lineInfos.get(i).text);
                                float fontSize = lineInfos.get(i).fontSize;
                                while (i + 1 < lineInfos.size()
                                        && lineInfos.get(i + 1).fontSize == fontSize) {
                                    mergedText.append(" ").append(lineInfos.get(i + 1).text);
                                    i++;
                                }
                                mergedLineInfos.add(new LineInfo(mergedText.toString(), fontSize));
                            }

                            // Sort lines by font size in descending order and get the first one
                            mergedLineInfos.sort(
                                    Comparator.comparing((LineInfo li) -> li.fontSize).reversed());
                            String title =
                                    mergedLineInfos.isEmpty()
                                            ? null
                                            : mergedLineInfos.getFirst().text;

                            return title != null
                                    ? title
                                    : (useFirstTextAsFallback
                                            ? (mergedLineInfos.isEmpty()
                                                    ? null
                                                    : mergedLineInfos.getLast().text)
                                            : null);
                        }

                        class LineInfo {
                            String text;
                            float fontSize;

                            LineInfo(String text, float fontSize) {
                                this.text = text;
                                this.fontSize = fontSize;
                            }
                        }
                    };

            String header = reader.getText(document);

            // Sanitize the header string by removing characters not allowed in a filename.
            if (header != null && header.length() < 255) {
                header =
                        RegexPatternUtils.getInstance()
                                .getSafeFilenamePattern()
                                .matcher(header)
                                .replaceAll("")
                                .trim();
                return WebResponseUtils.pdfDocToWebResponse(
                        document, header + ".pdf", tempFileManager);
            } else {
                log.info("File has no good title to be found");
                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        Filenames.toSimpleFileName(file.getOriginalFilename()),
                        tempFileManager);
            }
        }
    }
}
