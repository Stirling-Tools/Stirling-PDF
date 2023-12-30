package stirling.software.SPDF.controller.api.misc;

import java.awt.Color;
import java.awt.geom.AffineTransform;
import java.awt.image.AffineTransformOp;

import java.awt.image.BufferedImage;
import java.awt.image.BufferedImageOp;
import java.awt.image.ConvolveOp;
import java.awt.image.Kernel;
import java.awt.image.RescaleOp;
import java.io.ByteArrayOutputStream;

import java.io.File;
import java.io.IOException;
import java.security.SecureRandom;

import java.util.Random;


import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class FakeScanControllerWIP {

    private static final Logger logger = LoggerFactory.getLogger(FakeScanControllerWIP.class);

    //TODO
    @Hidden
    @PostMapping(consumes = "multipart/form-data", value = "/fakeScan")
    @Operation(
        summary = "Repair a PDF file",
        description = "This endpoint repairs a given PDF file by running Ghostscript command. The PDF is first saved to a temporary location, repaired, read back, and then returned as a response."
    )
    public ResponseEntity<byte[]> repairPdf(@ModelAttribute PDFFile request) throws IOException {
        MultipartFile inputFile = request.getFileInput();

    	PDDocument document = PDDocument.load(inputFile.getBytes());
    	PDFRenderer pdfRenderer = new PDFRenderer(document);
    	for (int page = 0; page < document.getNumberOfPages(); ++page)
    	{
    	    BufferedImage image = pdfRenderer.renderImageWithDPI(page, 300, ImageType.RGB);
    	    ImageIO.write(image, "png", new File("scanned-" + (page+1) + ".png"));
    	}
    	document.close();

    	// Constants
    	int scannedness = 90;  // Value between 0 and 100
    	int dirtiness = 0;  // Value between 0 and 100

    	// Load the source image
    	BufferedImage sourceImage = ImageIO.read(new File("scanned-1.png"));

    	// Create the destination image
    	BufferedImage destinationImage = new BufferedImage(sourceImage.getWidth(), sourceImage.getHeight(), sourceImage.getType());

    	// Apply a brightness and contrast effect based on the "scanned-ness"
    	float scaleFactor = 1.0f + (scannedness / 100.0f) * 0.5f;  // Between 1.0 and 1.5
    	float offset = scannedness * 1.5f;  // Between 0 and 150
    	BufferedImageOp op = new RescaleOp(scaleFactor, offset, null);
    	op.filter(sourceImage, destinationImage);

    	// Apply a rotation effect
    	double rotationRequired = Math.toRadians((new SecureRandom().nextInt(3 - 1) + 1));  // Random angle between 1 and 3 degrees
    	double locationX = destinationImage.getWidth() / 2;
    	double locationY = destinationImage.getHeight() / 2;
    	AffineTransform tx = AffineTransform.getRotateInstance(rotationRequired, locationX, locationY);
    	AffineTransformOp rotateOp = new AffineTransformOp(tx, AffineTransformOp.TYPE_BILINEAR);
    	destinationImage = rotateOp.filter(destinationImage, null);

    	// Apply a blur effect based on the "scanned-ness"
    	float blurIntensity = scannedness / 100.0f * 0.2f;  // Between 0.0 and 0.2
    	float[] matrix = {
    	    blurIntensity, blurIntensity, blurIntensity,
    	    blurIntensity, blurIntensity, blurIntensity,
    	    blurIntensity, blurIntensity, blurIntensity
    	};
    	BufferedImageOp blurOp = new ConvolveOp(new Kernel(3, 3, matrix), ConvolveOp.EDGE_NO_OP, null);
    	destinationImage = blurOp.filter(destinationImage, null);

    	// Add noise to the image based on the "dirtiness"
    	Random random = new SecureRandom();
    	for (int y = 0; y < destinationImage.getHeight(); y++) {
    	    for (int x = 0; x < destinationImage.getWidth(); x++) {
    	        if (random.nextInt(100) < dirtiness) {
    	            // Change the pixel color to black randomly based on the "dirtiness"
    	            destinationImage.setRGB(x, y, Color.BLACK.getRGB());
    	        }
    	    }
    	}

    	// Save the image
    	ImageIO.write(destinationImage, "PNG", new File("scanned-1.png"));


    	
    	
    	
    	

    	PDDocument documentOut = new PDDocument();
    	for (int page = 1; page <= document.getNumberOfPages(); ++page)
    	{
    	    BufferedImage bim = ImageIO.read(new File("scanned-" + page + ".png"));
    	    
    	    // Adjust the dimensions of the page
    	    PDPage pdPage = new PDPage(new PDRectangle(bim.getWidth() - 1, bim.getHeight() - 1));
    	    documentOut.addPage(pdPage);
    	    
    	    PDImageXObject pdImage = LosslessFactory.createFromImage(documentOut, bim);
    	    PDPageContentStream contentStream = new PDPageContentStream(documentOut, pdPage);
    	    
    	    // Draw the image with a slight offset and enlarged dimensions
    	    contentStream.drawImage(pdImage, -1, -1, bim.getWidth() + 2, bim.getHeight() + 2);
    	    contentStream.close();
    	}
    	ByteArrayOutputStream baos = new ByteArrayOutputStream();
    	documentOut.save(baos);
    	documentOut.close();

        // Return the optimized PDF as a response
        String outputFilename = inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_scanned.pdf";
        return WebResponseUtils.boasToWebResponse(baos, outputFilename);
    }

}
