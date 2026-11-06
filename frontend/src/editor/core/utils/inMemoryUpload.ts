export async function inMemoryFormData(form: FormData): Promise<FormData> {
  const copy = new FormData();
  for (const [key, value] of form.entries()) {
    copy.append(
      key,
      typeof value === "string"
        ? value
        : new File([await value.arrayBuffer()], value.name, {
            type: value.type,
            lastModified: value.lastModified,
          }),
    );
  }
  return copy;
}

export function uploadsNeedInMemoryFiles(userAgent: string): boolean {
  return /AppleWebKit/.test(userAgent) && !/Chrome\//.test(userAgent);
}
