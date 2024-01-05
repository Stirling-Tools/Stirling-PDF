
import { PdfFile } from "../../wrappers/PdfFile";

export async function sortPdfArray(
    files: PdfFile[],
    sortType: "orderProvided"|"byFileName"|"byDateModified"|"byDateCreated"|"byPDFTitle" = "orderProvided"
): Promise<PdfFile[]> {
    
    const docCache = await PdfFile.cacheAsPdfLibDocuments(files);

    switch(sortType) {
    case "byFileName":
        files.sort((a, b) => {
            if (!a || !b) return 0;
            const ad = a.filename, bd = b.filename;
            if (!ad || !bd) return 0;
            return ad.localeCompare(bd);
        });
        break;
    case "byDateModified":
        files.sort((a, b) => {
            const ad = docCache.get(a).getModificationDate().getTime();
            const bd = docCache.get(b).getModificationDate().getTime();
            if (!ad || !bd) return 0;
            return ad > bd ? 1 : -1;
        });
        break;
    case "byDateCreated":
        files.sort((a, b) => {
            const ad = docCache.get(a).getCreationDate().getTime();
            const bd = docCache.get(b).getCreationDate().getTime();
            if (!ad || !bd) return 0;
            return ad > bd ? 1 : -1;
        });
        break;
    case "byPDFTitle":
        files.sort((a, b) => {
            const ad = docCache.get(a).getTitle();
            const bd = docCache.get(b).getTitle();
            if (!ad || !bd) return 0;
            return ad.localeCompare(bd);
        });
        break;
    }
    
    return files;
}