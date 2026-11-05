import java.nio.file.*; import java.util.*;
import org.apache.pdfbox.Loader; import org.apache.pdfbox.pdmodel.PDDocument;
import stirling.software.common.pdf.worker.MergeJob;
public class Verify { public static void main(String[] a) throws Exception {
  Path out = Path.of("/tmp/v.pdf"); Path in = Path.of("/b/bookmarked1.pdf");
  new MergeJob(List.of(in, in, in), out, null, false).run();
  try (PDDocument d = Loader.loadPDF(out.toFile())) { int n = 0; for (var i : d.getDocumentCatalog().getDocumentOutline().children()) n++;
    System.out.println("qpdf=" + System.getProperty("jpdfium.merge.qpdfDirect") + " pages=" + d.getNumberOfPages() + " outline=" + n
      + " jpdfium=" + MergeJob.class.getClassLoader().getResource("stirling/software/jpdfium/PdfMerge.class").getPath().replaceAll(".*/lib/|!.*", "")); }
  System.exit(0); } }
