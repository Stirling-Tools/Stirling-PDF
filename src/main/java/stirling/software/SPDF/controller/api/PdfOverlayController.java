package stirling.software.SPDF.controller.api;
import org.apache.pdfbox.multipdf.Overlay;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.ResponseEntity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.general.OverlayPdfsRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import java.io.File;
@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class PdfOverlayController {

    @PostMapping(value = "/overlay-pdfs", consumes = "multipart/form-data")
    @Operation(summary = "Overlay PDF files in various modes", description = "Overlay PDF files onto a base PDF with different modes: Sequential, Interleaved, or Fixed Repeat. Input:PDF Output:PDF Type:MIMO")
    public ResponseEntity<byte[]> overlayPdfs(@ModelAttribute OverlayPdfsRequest request) throws IOException {
        MultipartFile baseFile = request.getFileInput();
        int overlayPos = request.getOverlayPosition();
        
        MultipartFile[] overlayFiles = request.getOverlayFiles();
        File[] overlayPdfFiles = new File[overlayFiles.length];
        try{ 
	        for (int i = 0; i < overlayFiles.length; i++) {
	            overlayPdfFiles[i] = GeneralUtils.multipartToFile(overlayFiles[i]);
	        }
	        
	        String mode = request.getOverlayMode(); // "SequentialOverlay", "InterleavedOverlay", "FixedRepeatOverlay"
	        int[] counts = request.getCounts(); // Used for FixedRepeatOverlay mode
	
	        try (PDDocument basePdf = PDDocument.load(baseFile.getInputStream());
					Overlay overlay = new Overlay()) {
	            Map<Integer, String> overlayGuide = prepareOverlayGuide(basePdf.getNumberOfPages(), overlayPdfFiles, mode, counts);
	            
	            overlay.setInputPDF(basePdf);
	            if(overlayPos == 0) {
	            	overlay.setOverlayPosition(Overlay.Position.FOREGROUND);
	            } else {
	            	overlay.setOverlayPosition(Overlay.Position.BACKGROUND);
	            }
	
	            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
	            overlay.overlay(overlayGuide).save(outputStream);
	            byte[] data = outputStream.toByteArray();
	
	            return WebResponseUtils.bytesToWebResponse(data, "overlaid.pdf", MediaType.APPLICATION_PDF);
	        } 
        } finally {
            for (File overlayPdfFile : overlayPdfFiles) {
                if (overlayPdfFile != null) overlayPdfFile.delete();
            }
        }
    }

    private Map<Integer, String> prepareOverlayGuide(int basePageCount, File[] overlayFiles, String mode, int[] counts) throws IOException {
        Map<Integer, String> overlayGuide = new HashMap<>();
        switch (mode) {
            case "SequentialOverlay":
                sequentialOverlay(overlayGuide, overlayFiles, basePageCount);
                break;
            case "InterleavedOverlay":
                interleavedOverlay(overlayGuide, overlayFiles, basePageCount);
                break;
            case "FixedRepeatOverlay":
                fixedRepeatOverlay(overlayGuide, overlayFiles, counts, basePageCount);
                break;
            default:
                throw new IllegalArgumentException("Invalid overlay mode");
        }
        return overlayGuide;
    }

    private void sequentialOverlay(Map<Integer, String> overlayGuide, File[] overlayFiles, int basePageCount) throws IOException {
        int currentPage = 1;
        for (File overlayFile : overlayFiles) {
            try (PDDocument overlayPdf = PDDocument.load(overlayFile)) {
                for (int i = 0; i < overlayPdf.getNumberOfPages(); i++) {
                    if (currentPage > basePageCount) break;
                    overlayGuide.put(currentPage++, overlayFile.getAbsolutePath());
                }
            }
        }
    }

    private void interleavedOverlay(Map<Integer, String> overlayGuide, File[] overlayFiles, int basePageCount) throws IOException {
        for (int i = 0; i < basePageCount; i++) {
        	File overlayFile = overlayFiles[i % overlayFiles.length];
            overlayGuide.put(i + 1, overlayFile.getAbsolutePath());
        }
    }

    private void fixedRepeatOverlay(Map<Integer, String> overlayGuide, File[] overlayFiles, int[] counts, int basePageCount) throws IOException {
        if (overlayFiles.length != counts.length) {
            throw new IllegalArgumentException("Counts array length must match the number of overlay files");
        }
        int currentPage = 1;
        for (int i = 0; i < overlayFiles.length; i++) {
        	File overlayFile = overlayFiles[i];
            int repeatCount = counts[i];
            for (int j = 0; j < repeatCount; j++) {
                if (currentPage > basePageCount) break;
                overlayGuide.put(currentPage++, overlayFile.getAbsolutePath());
            }
        }
    }
}

// Additional classes like OverlayPdfsRequest, WebResponseUtils, etc. are assumed to be defined elsewhere.
