
import { Response } from 'express';
import { PdfFile } from '@stirling-pdf/shared-operations/wrappers/PdfFile'

export async function respondWithFile(res: Response, bytes: Uint8Array, name: string, mimeType: string): Promise<void> {
    res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-disposition': 'attachment;filename=' + name,
        'Content-Length': bytes.length
    });
    res.end(bytes);
}

export async function respondWithPdfFile(res: Response, file: PdfFile): Promise<void> {
    const byteFile = await file.convertToByteArrayFile();
    respondWithFile(res, byteFile.byteArray!, byteFile.filename, "application/pdf");
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

export function response_dependencyNotConfigured(res: Response, dependencyName: string): void {
    res.status(400).send([
        {
            "message": `${dependencyName} is not configured correctly on the server.`,
            "type": "dependency_error",
        }
    ]);
}
