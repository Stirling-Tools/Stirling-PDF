import type { Route } from "@playwright/test";

/** Password-protected fixtures must reject the empty-password probe just as the backend does. */
export async function rejectEmptyOpeningPassword(
  route: Route,
): Promise<boolean> {
  const request = new Request(route.request().url(), {
    method: "POST",
    headers: route.request().headers(),
    body: new Uint8Array(route.request().postDataBuffer()!),
  });
  if ((await request.formData()).get("password")) return false;
  await route.fulfill({
    status: 400,
    contentType: "application/problem+json",
    json: {
      type: "/errors/pdf-password",
      title: "PDF password incorrect",
      status: 400,
      detail: "The PDF requires its opening password.",
    },
  });
  return true;
}
