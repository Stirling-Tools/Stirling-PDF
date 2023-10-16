import { scaleContent } from "./functions/scaleContent.js";
import { scalePage, PageSize } from "./functions/scalePage.js";

(async () => {
    const pdfFileInput = document.getElementById('pdfFile');

    pdfFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            let pdfBuffer = new Uint8Array(await file.arrayBuffer());
            pdfBuffer = await scaleContent(pdfBuffer, 2);
            pdfBuffer = await scalePage(pdfBuffer, PageSize.letter);
            download(pdfBuffer, "pdf-lib_creation_example.pdf", "application/pdf");
        }
    });
})();
