
import { Response } from "express";
import { PdfFile } from "@stirling-pdf/shared-operations/src/wrappers/PdfFile";
import Archiver from "archiver";

export async function respondWithFile(res: Response, uint8Array: Uint8Array, filename: string, mimeType: string): Promise<void> {
    res.writeHead(200, {
        "Content-Type": mimeType,
        "Content-disposition": `attachment; filename="${filename}"`,
        "Content-Length": uint8Array.length
    });
    res.end(uint8Array);
}

export async function respondWithPdfFile(res: Response, file: PdfFile): Promise<void> {
    const byteArray = await file.uint8Array;
    respondWithFile(res, byteArray, file.filename+".pdf", "application/pdf");
}

export async function respondWithZip(res: Response, filename: string, files: {uint8Array: Uint8Array, filename: string}[]): Promise<void> {
    if (files.length == 0) {
        res.status(500).json({"warning": "The workflow had no outputs."});
        return;
    }

    console.log(filename);
    res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-disposition": `attachment; filename="${filename}.zip"`,
    });

    // TODO: Also allow changing the compression level
    const zip = Archiver("zip");

    // Stream the file to the user.
    zip.pipe(res);

    console.log("Adding Files to ZIP...");

    for (let i = 0; i < files.length; i++) {
        zip.append(Buffer.from(files[i].uint8Array), { name: files[i].filename });   
    }

    zip.finalize();
    console.log("Sent");
}

export async function respondWithPdfFiles(res: Response, pdfFiles: PdfFile[] | undefined, filename: string) {
    if(!pdfFiles || pdfFiles.length == 0) {
        res.status(500).json({"warning": "The workflow had no outputs."});
    }
    else if (pdfFiles.length == 1) {
        respondWithPdfFile(res, pdfFiles[0]);
    }
    else {
        const promises = pdfFiles.map(async (pdf) => {return{uint8Array: await pdf.uint8Array, filename: pdf.filename + ".pdf"}});
        const files = await Promise.all(promises);
        respondWithZip(res, filename, files);
    }
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
