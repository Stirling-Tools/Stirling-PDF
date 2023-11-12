
import { Response } from 'express';
import { PdfFile } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile'

export async function respondWithPdfFile(res: Response, file: PdfFile): Promise<void> {
    const byteFile = await file.convertToByteArrayFile();
    res.writeHead(200, {
        'Content-Type': "application/pdf",
        'Content-disposition': 'attachment;filename=' + byteFile.filename,
        'Content-Length': byteFile.byteArray?.length
    });
    res.end(byteFile.byteArray)
}

export function response_mustHaveExactlyOneFile(res: Response): void {
    res.status(400).send([
        {
            "message": "file is required",
            "path": [
                "pdfFile"
            ],
            "type": "file",
            "context": {
                "label": "pdfFile",
                "key": "pdfFile"
            }
        }
    ]);
}
