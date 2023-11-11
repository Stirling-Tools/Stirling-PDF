
import express, { Request, Response } from 'express';

export function respondWithBinaryPdf(res: Response, buffer: Uint8Array, filename: string) {
    res.writeHead(200, {
        'Content-Type': "application/pdf",
        'Content-disposition': 'attachment;filename=' + filename,
        'Content-Length': buffer.length
    });
    res.end(buffer)
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
