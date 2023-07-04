package stirling.software.SPDF.controller.api.other;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.*;
import org.apache.pdfbox.pdmodel.PDPageContentStream.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.multipart.MultipartFile;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.media.*;
import io.swagger.v3.oas.annotations.parameters.*;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.text.TextPosition;
import org.apache.tomcat.util.http.ResponseUtil;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.util.List;
import java.util.ArrayList;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;

import java.io.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.text.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.ResponseEntity;
@RestController
@Tag(name = "Other", description = "Other APIs")
public class AutoRenameController {

    private static final Logger logger = LoggerFactory.getLogger(AutoRenameController.class);

    private static final float TITLE_FONT_SIZE_THRESHOLD = 20.0f;
    private static final int LINE_LIMIT = 7;

    @PostMapping(consumes = "multipart/form-data", value = "/auto-rename")
    @Operation(summary = "Extract header from PDF file", description = "This endpoint accepts a PDF file and attempts to extract its title or header based on heuristics. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> extractHeader(
    	            @RequestPart(value = "fileInput") @Parameter(description = "The input PDF file from which the header is to be extracted.", required = true) MultipartFile file,
    	            @RequestParam(required = false, defaultValue = "false") @Parameter(description = "Flag indicating whether to use the first text as a fallback if no suitable title is found. Defaults to false.", required = false) Boolean useFirstTextAsFallback)
    	            throws Exception {

    	        PDDocument document = PDDocument.load(file.getInputStream());
    	        PDFTextStripper reader = new PDFTextStripper() {
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

    	                // Sort lines by font size in descending order and get the first one
    	                lineInfos.sort(Comparator.comparing((LineInfo li) -> li.fontSize).reversed());
    	                String title = lineInfos.isEmpty() ? null : lineInfos.get(0).text;

    	                return title != null ? title : (useFirstTextAsFallback ? (lineInfos.isEmpty() ? null : lineInfos.get(lineInfos.size() - 1).text) : null);
    	            }
    	        };

    	        String header = reader.getText(document);


        
        // Sanitize the header string by removing characters not allowed in a filename.
        if (header != null && header.length() < 255) {
            header = header.replaceAll("[/\\\\?%*:|\"<>]", "");
            return WebResponseUtils.pdfDocToWebResponse(document, header + ".pdf");
        } else {
        	logger.info("File has no good title to be found");
        	return WebResponseUtils.pdfDocToWebResponse(document, file.getOriginalFilename());
        }
    }
    



}
