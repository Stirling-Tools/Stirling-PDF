
import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec, spawn } from 'child_process'
import { PdfFile, RepresentationType } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile'

export async function fileToPdf(byteArray: Uint8Array, filename: string): Promise<PdfFile> {
    const parentDir = path.join(os.tmpdir(), "StirlingPDF");
    fs.mkdirSync(parentDir, {recursive: true});
    const tempDir = fs.mkdtempSync(parentDir+"/");
    const srcFile = path.join(tempDir, filename);
    const randFolderName = path.parse(tempDir).base;

    await writeBytesToFile(srcFile, byteArray);

    const messages = await runLibreOfficeCommand(randFolderName, ["--headless","--convert-to","pdf",srcFile,"--outdir",tempDir]);

    const files = fs.readdirSync(tempDir).filter(file => file.endsWith(".pdf"));
    if (files.length > 1) {
        console.warn("Ambiguous file to pdf outputs: Returning first result", files);
    } else if (files.length == 0) {
        throw new Error("File to pdf failed: no output files found. Messages: "+messages);
    }

    const outputFileName = files[0];
    const outputFilePath = path.join(tempDir, outputFileName);
    const outputBytes = await readBytesFromFile(outputFilePath);

    fs.rmdirSync(tempDir, {recursive: true});

    return new PdfFile(outputFileName, outputBytes, RepresentationType.Uint8Array);
}

export function isLibreOfficeInstalled() {
    return new Promise((resolve, reject) => {
        exec("libreoffice --version", (error, stdout, stderr) => {
            if (error) {
                resolve(false);
                return;
            }
            if (stderr) {
                resolve(false);
                return;
            }
            const result = stdout.match("LibreOffice ([0-9]+\.){4}.*");
            resolve(result ? true : false);
        });
    })
}

function writeBytesToFile(filePath: string, bytes: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, bytes, function(err) {
            if(err) {
                reject(err)
                return;
            }
            resolve();
        });
    });
}

function readBytesFromFile(filePath: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                reject(new Error(`Error reading file: ${err.message}`));
            } else {
                const uint8Array = new Uint8Array(data);
                resolve(uint8Array);
            }
        });
    });
}
  
function runLibreOfficeCommand(idKey: string, args: string[]): Promise<string[]> {
    return new Promise(async (resolve, reject) => {
        const messageList: string[] = [];

        const process = spawn("libreoffice", args);

        process.stdout.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`Progress ${idKey}:`, dataStr);
            messageList.push(dataStr);
        });

        process.stderr.on('data', (data) => {
            console.error(`stderr ${idKey}:`, data.toString());
        });

        process.on('exit', (code) => {
            if (code === 0) {
                resolve(messageList);
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        process.on('error', (err) => {
            reject(err);
        });
        
    });
}
