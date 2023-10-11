package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.misc.RemoveBlankPagesRequest;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class BlankPageController {

	@PostMapping(consumes = "multipart/form-data", value = "/remove-blanks")
	@Operation(
	    summary = "Remove blank pages from a PDF file",
	    description = "This endpoint removes blank pages from a given PDF file. Users can specify the threshold and white percentage to tune the detection of blank pages. Input:PDF Output:PDF Type:SISO"
	)
	public ResponseEntity<byte[]> removeBlankPages(@ModelAttribute RemoveBlankPagesRequest request) throws IOException, InterruptedException {
	    MultipartFile inputFile = request.getFileInput();
	    int threshold = request.getThreshold();
	    float whitePercent = request.getWhitePercent();
		
    	PDDocument document = null;
        try {
            document = PDDocument.load(inputFile.getInputStream());
            PDPageTree pages = document.getDocumentCatalog().getPages();
            PDFTextStripper textStripper = new PDFTextStripper();

            List<Integer> pagesToKeepIndex = new ArrayList<>();
            int pageIndex = 0;
            PDFRenderer pdfRenderer = new PDFRenderer(document);

            for (PDPage page : pages) {
                System.out.println("checking page " + pageIndex);
                textStripper.setStartPage(pageIndex + 1);
                textStripper.setEndPage(pageIndex + 1);
                String pageText = textStripper.getText(document);
                boolean hasText = !pageText.trim().isEmpty();
                if (hasText) {
                    pagesToKeepIndex.add(pageIndex);
                    System.out.println("page " + pageIndex + " has text");
                } else {
                    boolean hasImages = PdfUtils.hasImagesOnPage(page);
                    if (hasImages) {
                        System.out.println("page " + pageIndex + " has image");
    
                        Path tempFile = Files.createTempFile("image_", ".png");
    
                        // Render image and save as temp file
                        BufferedImage image = pdfRenderer.renderImageWithDPI(pageIndex, 300);
                        ImageIO.write(image, "png", tempFile.toFile());
    
                        List<String> command = new ArrayList<>(Arrays.asList("python3", System.getProperty("user.dir") + "/scripts/detect-blank-pages.py", tempFile.toString() ,"--threshold", String.valueOf(threshold), "--white_percent", String.valueOf(whitePercent)));
    
                        // Run CLI command
                        ProcessExecutorResult returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV).runCommandWithOutputHandling(command);
    
                        // does contain data
                        if (returnCode.getRc() == 0) {
                            System.out.println("page " + pageIndex + " has image which is not blank");
                            pagesToKeepIndex.add(pageIndex);
                        } else {
                            System.out.println("Skipping, Image was blank for page #" + pageIndex);
                        }
                    }
                }
                pageIndex++;
                
            }
            System.out.print("pagesToKeep=" + pagesToKeepIndex.size());

            // Remove pages not present in pagesToKeepIndex
            List<Integer> pageIndices = IntStream.range(0, pages.getCount()).boxed().collect(Collectors.toList());
            Collections.reverse(pageIndices); // Reverse to prevent index shifting during removal
            for (Integer i : pageIndices) {
                if (!pagesToKeepIndex.contains(i)) {
                    pages.remove(i);
                }
            }

            return WebResponseUtils.pdfDocToWebResponse(document, inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_blanksRemoved.pdf");
        } catch (IOException e) {
            e.printStackTrace();
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        } finally {
            if (document != null)
                document.close();
        }
    }


    
}
