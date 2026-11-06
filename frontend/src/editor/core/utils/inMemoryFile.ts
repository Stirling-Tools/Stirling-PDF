export async function inMemoryFile(file: File): Promise<File> {
  return new File([await file.arrayBuffer()], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export async function inMemoryFormData(form: FormData): Promise<FormData> {
  const copy = new FormData();
  for (const [key, value] of form.entries()) {
    copy.append(
      key,
      typeof value === "string" ? value : await inMemoryFile(value),
    );
  }
  return copy;
}

export function uploadsNeedInMemoryFiles(userAgent: string): boolean {
  return /AppleWebKit/.test(userAgent) && !/Chrome\//.test(userAgent);
}
