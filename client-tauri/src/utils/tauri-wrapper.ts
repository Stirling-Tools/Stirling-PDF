
import { open, save } from '@tauri-apps/api/dialog';
import { readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';

export type TauriBrowserFile = {
    name: string,
    relativePath?: string,
    data: Uint8Array,
    getPath: ()=>string
}
function byteArrayToFile(byteArray: Uint8Array, filePath: string): TauriBrowserFile | null {
    const separator = filePath.includes("\\") ? "\\" : "/";

    const split = filePath.split(separator);
    const fileName = split.pop();
    const path = split.join(separator);
    if (!fileName) return null;
    return {
        name: fileName,
        data: byteArray,
        relativePath: path?path:undefined,
        getPath: ()=> (path?path:undefined) + separator + fileName,
    };
}

export function isTauriAvailable() {
    return (window as any).__TAURI_IPC__ ? true : false;
}

// [*] = Not available in browser
type SelectFilesDialogOptions = {
    defaultPath?: string, // [*] the default path to open the dialog on
    directory?: boolean,  // should the dialog be a directory dialog
    filters?: Array<{     // list of file type filters 
        name: string,        // category name eg. 'Images'
        extensions: string[] // list of extensions eg ['png', 'jpeg', 'jpg'] 
    }>,
    multiple?: boolean,   // allow multiple selections
    recursive?: boolean,  // [*] If directory is true, indicates that it will be read recursively later. Defines whether subdirectories will be allowed on the scope or not.
    title?: string        // [*] the title of the dialog
}
export function openFiles(options: SelectFilesDialogOptions): Promise<TauriBrowserFile[] | null> {
    return new Promise(async (resolve) => {
        if (isTauriAvailable()) {
            var selected = await open(options);
            if (!selected) {
                resolve(null);
                return;
            }

            if (!Array.isArray(selected)) {
                selected = [selected];
            }
        
            const files:TauriBrowserFile[] = [];
            for (const s of selected) {
                const contents = await readBinaryFile(s);
                const res = byteArrayToFile(contents, s);
                if (res) {
                    files.push(res);
                }
            }
            
            resolve(files);
            return;
        } else {
            var input = document.createElement('input');
            input.type = 'file';
            if (options.directory) input.setAttribute("webkitdirectory", "");
            if (options.filters) input.setAttribute("accept", options.filters.flatMap(f => f.extensions).map(ext => "."+ext).join(", "));
            if (options.multiple) input.setAttribute("multiple", "");
        
            input.onchange = async () => {
                if (input.files && input.files.length) { 
                    console.log("input.files", input.files)
                    const files:TauriBrowserFile[] = [];
                    for (const f of input.files) {
                        const contents = new Uint8Array(await f.arrayBuffer());
                        const res = byteArrayToFile(contents, f.name);
                        if (res) {
                            files.push(res);
                        }
                    }

                    resolve(files);
                }
                input.onchange = null;
                document.body.onfocus = null;
            };

            // detect the user clicking cancel
            document.body.onfocus = () => {
                setTimeout(()=>resolve(null), 200); // the timeout is needed because 'document.body.onfocus' is called before 'input.onchange'
            }

            input.click();
        }
    });
}

// [*] = Not available in browser
type DownloadFilesDialogOptions = {
    defaultPath?: string, // the default path to open the dialog on
    filters?: Array<{     // [*] list of file type filters 
        name: string,        // category name eg. 'Images'
        extensions: string[] // list of extensions eg ['png', 'jpeg', 'jpg'] 
    }>,
    title?: string        // [*] the title of the dialog
}
export async function downloadFile(fileData: Uint8Array, options: DownloadFilesDialogOptions): Promise<undefined> {
    if (isTauriAvailable()) {
        const pathToSave = await save(options);
        console.log("pathToSave", pathToSave)
        if (pathToSave) {
            await writeBinaryFile(pathToSave, fileData);
        }
    } else {
        const pdfBlob = new Blob([fileData], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        const downloadOption = localStorage.getItem('downloadOption');

        // ensure filename is not a path
        const separator = options.defaultPath?.includes("\\") ? "\\" : "/";
        const filename = options.defaultPath?.split(separator).pop();
        const filenameToUse = filename ? filename : 'edited.pdf';

        if (downloadOption === 'sameWindow') {
            // Open the file in the same window
            window.location.href = url;
        } else if (downloadOption === 'newWindow') {
            // Open the file in a new window
            window.open(url, '_blank');
        } else {
            // Download the file
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filenameToUse;
            downloadLink.click();
        }
    }
}