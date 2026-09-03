export interface ApiErrorShape {
  error?: { code?: string; message?: string };
}

let csrfToken = "";
const sessionToken = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & ApiErrorShape;
  if (!response.ok) {
    const error = new Error(body.error?.message ?? "処理に失敗しました。") as Error & { code?: string };
    if (body.error?.code !== undefined) error.code = body.error.code;
    throw error;
  }
  return body;
}

export async function bootstrap<T>(): Promise<T> {
  if (sessionToken.length === 0) throw new Error("起動URLのセッショントークンがありません。ターミナルに表示されたURLを開き直してください。");
  const response = await fetch("/api/bootstrap", { headers: { "X-Session-Token": sessionToken }, cache: "no-store" });
  const body = await parseResponse<T & { csrfToken: string }>(response);
  csrfToken = body.csrfToken;
  return body;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { "X-Session-Token": sessionToken }, cache: "no-store" });
  return parseResponse<T>(response);
}

export async function postJson<T>(path: string, value: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": sessionToken,
      "X-CSRF-Token": csrfToken
    },
    body: JSON.stringify(value),
    cache: "no-store"
  });
  return parseResponse<T>(response);
}
