package stirling.software.SPDF.utils;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.spire.pdf.PdfDocument;

public class PdfUtils {

	private static final Logger logger = LoggerFactory.getLogger(PdfUtils.class);

	public static byte[] convertToPdf(InputStream imageStream) throws IOException {

		// Create a File object for the image
		File imageFile = new File("image.jpg");

		try (FileOutputStream fos = new FileOutputStream(imageFile); InputStream input = imageStream) {
			byte[] buffer = new byte[1024];
			int len;
			// Read from the input stream and write to the file
			while ((len = input.read(buffer)) != -1) {
				fos.write(buffer, 0, len);
			}
			logger.info("Image successfully written to file: {}", imageFile.getAbsolutePath());
		} catch (IOException e) {
			logger.error("Error writing image to file: {}", imageFile.getAbsolutePath(), e);
			throw e;
		}

		try (PDDocument doc = new PDDocument()) {
			// Create a new PDF page
			PDPage page = new PDPage();
			doc.addPage(page);

			// Create an image object from the image file
			PDImageXObject image = PDImageXObject.createFromFileByContent(imageFile, doc);

			try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
				// Draw the image onto the page
				contentStream.drawImage(image, 0, 0);
				logger.info("Image successfully added to PDF");
			} catch (IOException e) {
				logger.error("Error adding image to PDF", e);
				throw e;
			}

			// Create a ByteArrayOutputStream to save the PDF to
			ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
			doc.save(byteArrayOutputStream);
			logger.info("PDF successfully saved to byte array");
			return byteArrayOutputStream.toByteArray();
		}
	}

	public static byte[] convertFromPdf(byte[] inputStream, String imageType) throws IOException {
		try (PDDocument document = PDDocument.load(new ByteArrayInputStream(inputStream))) {
			// Create a PDFRenderer to convert the PDF to an image
			PDFRenderer pdfRenderer = new PDFRenderer(document);
			BufferedImage bim = pdfRenderer.renderImageWithDPI(0, 300, ImageType.RGB);

			// Get an ImageWriter for the specified image type
			Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(imageType);
			ImageWriter writer = writers.next();

			// Create a ByteArrayOutputStream to save the image to
			ByteArrayOutputStream baos = new ByteArrayOutputStream();
			try (ImageOutputStream ios = ImageIO.createImageOutputStream(baos)) {
				writer.setOutput(ios);
				// Write the image to the output stream
				writer.write(new IIOImage(bim, null, null));
				// Log that the image was successfully written to the byte array
				logger.info("Image successfully written to byte array");
			}
			return baos.toByteArray();
		} catch (IOException e) {
			// Log an error message if there is an issue converting the PDF to an image
			logger.error("Error converting PDF to image", e);
			throw e;
		}
	}

	public static byte[] overlayImage(byte[] pdfBytes, byte[] imageBytes, float x, float y) throws IOException {

		try (PDDocument document = PDDocument.load(new ByteArrayInputStream(pdfBytes))) {
			// Get the first page of the PDF
			PDPage page = document.getPage(0);
			try (PDPageContentStream contentStream = new PDPageContentStream(document, page,
					PDPageContentStream.AppendMode.APPEND, true)) {
				// Create an image object from the image bytes
				PDImageXObject image = PDImageXObject.createFromByteArray(document, imageBytes, "");
				// Draw the image onto the page at the specified x and y coordinates
				contentStream.drawImage(image, x, y);
				logger.info("Image successfully overlayed onto PDF");
			}
			// Create a ByteArrayOutputStream to save the PDF to
			ByteArrayOutputStream baos = new ByteArrayOutputStream();
			document.save(baos);
			logger.info("PDF successfully saved to byte array");
			return baos.toByteArray();
		} catch (IOException e) {
			// Log an error message if there is an issue overlaying the image onto the PDF
			logger.error("Error overlaying image onto PDF", e);
			throw e;
		}
	}

	public static ResponseEntity<byte[]> pdfDocToWebResponse(PdfDocument document, String docName) throws IOException {

		// Open Byte Array and save document to it
		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		document.saveToStream(baos);
		// Close the document
		document.close();

		return PdfUtils.boasToWebResponse(baos, docName);
	}

	public static ResponseEntity<byte[]> pdfDocToWebResponse(PDDocument document, String docName) throws IOException {

		// Open Byte Array and save document to it
		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		document.save(baos);
		// Close the document
		document.close();

		return PdfUtils.boasToWebResponse(baos, docName);
	}

	public static ResponseEntity<byte[]> boasToWebResponse(ByteArrayOutputStream baos, String docName)
			throws IOException {
		return PdfUtils.bytesToWebResponse(baos.toByteArray(), docName);

	}

	public static ResponseEntity<byte[]> bytesToWebResponse(byte[] bytes, String docName) throws IOException {

		// Return the PDF as a response
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_PDF);
		headers.setContentLength(bytes.length);
		headers.setContentDispositionFormData("attachment", docName);
		return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
	}
}
