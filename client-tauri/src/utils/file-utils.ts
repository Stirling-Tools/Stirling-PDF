

export function appendToFilename(inputPath: string, toAppend: string) {
    const parts = inputPath.split('.');
    if (parts.length > 1) {
        parts[parts.length-2] = parts[parts.length-2] + toAppend;
    }
    return parts.join(".");
}
