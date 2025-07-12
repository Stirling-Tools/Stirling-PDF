package stirling.software.SPDF.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class PdfImageRemovalServiceTest {

    private PdfImageRemovalService service;

    @BeforeEach
    void setUp() {
        service = new PdfImageRemovalService();
    }

    @Test
    void testRemoveImagesFromPdf_WithImages() throws IOException {
        // Mock PDF document and its components
        PDDocument document = mock(PDDocument.class);
        PDPage page = mock(PDPage.class);
        PDResources resources = mock(PDResources.class);
        PDPageTree pageTree = mock(PDPageTree.class);

        // Configure page tree to iterate over our single page
        when(document.getPages()).thenReturn(pageTree);
        Iterator<PDPage> pageIterator = Arrays.asList(page).iterator();
        when(pageTree.iterator()).thenReturn(pageIterator);

        // Set up page resources
        when(page.getResources()).thenReturn(resources);

        // Set up image XObjects
        COSName img1 = COSName.getPDFName("Im1");
        COSName img2 = COSName.getPDFName("Im2");
        COSName nonImg = COSName.getPDFName("NonImg");

        List<COSName> xObjectNames = Arrays.asList(img1, img2, nonImg);
        when(resources.getXObjectNames()).thenReturn(xObjectNames);

        // Configure which are image XObjects
        when(resources.isImageXObject(img1)).thenReturn(true);
        when(resources.isImageXObject(img2)).thenReturn(true);
        when(resources.isImageXObject(nonImg)).thenReturn(false);

        // Execute the method
        PDDocument result = service.removeImagesFromPdf(document);

        // Verify that images were removed
        verify(resources, times(1)).put(eq(img1), Mockito.<PDXObject>isNull());
        verify(resources, times(1)).put(eq(img2), Mockito.<PDXObject>isNull());
        verify(resources, never()).put(eq(nonImg), Mockito.<PDXObject>isNull());
    }

    @Test
    void testRemoveImagesFromPdf_NoImages() throws IOException {
        // Mock PDF document and its components
        PDDocument document = mock(PDDocument.class);
        PDPage page = mock(PDPage.class);
        PDResources resources = mock(PDResources.class);
        PDPageTree pageTree = mock(PDPageTree.class);

        // Configure page tree to iterate over our single page
        when(document.getPages()).thenReturn(pageTree);
        Iterator<PDPage> pageIterator = Arrays.asList(page).iterator();
        when(pageTree.iterator()).thenReturn(pageIterator);

        // Set up page resources
        when(page.getResources()).thenReturn(resources);

        // Create empty list of XObject names
        List<COSName> emptyList = new ArrayList<>();
        when(resources.getXObjectNames()).thenReturn(emptyList);

        // Execute the method
        PDDocument result = service.removeImagesFromPdf(document);

        // Verify that no modifications were made
        verify(resources, never()).put(any(COSName.class), any(PDXObject.class));
    }

    @Test
    void testRemoveImagesFromPdf_MultiplePages() throws IOException {
        // Mock PDF document and its components
        PDDocument document = mock(PDDocument.class);
        PDPage page1 = mock(PDPage.class);
        PDPage page2 = mock(PDPage.class);
        PDResources resources1 = mock(PDResources.class);
        PDResources resources2 = mock(PDResources.class);
        PDPageTree pageTree = mock(PDPageTree.class);

        // Configure page tree to iterate over our two pages
        when(document.getPages()).thenReturn(pageTree);
        Iterator<PDPage> pageIterator = Arrays.asList(page1, page2).iterator();
        when(pageTree.iterator()).thenReturn(pageIterator);

        // Set up page resources
        when(page1.getResources()).thenReturn(resources1);
        when(page2.getResources()).thenReturn(resources2);

        // Set up image XObjects for page 1
        COSName img1 = COSName.getPDFName("Im1");
        when(resources1.getXObjectNames()).thenReturn(Arrays.asList(img1));
        when(resources1.isImageXObject(img1)).thenReturn(true);

        // Set up image XObjects for page 2
        COSName img2 = COSName.getPDFName("Im2");
        when(resources2.getXObjectNames()).thenReturn(Arrays.asList(img2));
        when(resources2.isImageXObject(img2)).thenReturn(true);

        // Execute the method
        PDDocument result = service.removeImagesFromPdf(document);

        // Verify that images were removed from both pages
        verify(resources1, times(1)).put(eq(img1), Mockito.<PDXObject>isNull());
        verify(resources2, times(1)).put(eq(img2), Mockito.<PDXObject>isNull());
    }

    // Helper method for matching COSName in verification
    private static COSName eq(final COSName value) {
        return Mockito.argThat(
                new org.mockito.ArgumentMatcher<COSName>() {
                    @Override
                    public boolean matches(COSName argument) {
                        if (argument == null && value == null) return true;
                        if (argument == null || value == null) return false;
                        return argument.getName().equals(value.getName());
                    }

                    @Override
                    public String toString() {
                        return "eq(" + (value != null ? value.getName() : "null") + ")";
                    }
                });
    }
}
