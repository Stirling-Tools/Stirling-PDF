export async function inMemoryFile(file: File): Promise<File> {
  return new File([await file.arrayBuffer()], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}
