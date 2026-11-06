const IN_MEMORY_COPY_BUDGET_BYTES = 512 * 1024 * 1024;

export async function inMemoryFormData(
  form: FormData,
  budgetBytes = IN_MEMORY_COPY_BUDGET_BYTES,
): Promise<FormData> {
  const copy = new FormData();
  let remaining = budgetBytes;
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" || value.size > remaining) {
      copy.append(key, value);
      continue;
    }
    remaining -= value.size;
    copy.append(
      key,
      new File([await value.arrayBuffer()], value.name, {
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
