
import { PdfFile, convertAllToPdfLibFile } from '../../wrappers/PdfFile';

export async function sortPdfs(
        files: PdfFile[],
        sortType: "orderProvided"|"byFileName"|"byDateModified"|"byDateCreated"|"byPDFTitle" = "orderProvided"
    ): Promise<PdfFile[]> {

    const pdfLibFiles = await convertAllToPdfLibFile(files);
    
    switch(sortType) {
        case "byFileName":
            pdfLibFiles.sort((a, b) => {
                if (!a || !b) return 0;
                const ad = a.filename, bd = b.filename;
                if (!ad || !bd) return 0;
                return ad.localeCompare(bd);
            });
            break;
        case "byDateModified":
            pdfLibFiles.sort((a, b) => {
                const ad = a.pdfLib?.getModificationDate()?.getTime();
                const bd = b.pdfLib?.getModificationDate()?.getTime();
                if (!ad || !bd) return 0;
                return ad > bd ? 1 : -1
            });
            break;
        case "byDateCreated":
            pdfLibFiles.sort((a, b) => {
                const ad = a.pdfLib?.getCreationDate()?.getTime();
                const bd = b.pdfLib?.getCreationDate()?.getTime();
                if (!ad || !bd) return 0;
                return ad > bd ? 1 : -1
            });
            break;
        case "byPDFTitle":
            pdfLibFiles.sort((a, b) => {
                const ad = a.pdfLib?.getTitle();
                const bd = b.pdfLib?.getTitle();
                if (!ad || !bd) return 0;
                return ad.localeCompare(bd);
            });
            break;
    }
    
    return pdfLibFiles;
}