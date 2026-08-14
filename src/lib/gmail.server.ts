/**
 * Server-only Gmail sender using the Lovable connector gateway.
 * Credentials never reach the browser.
 */
function base64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function isGmailConfigured(): boolean {
  return Boolean(process.env["GOOGLE_MAIL_API_KEY"] && process.env["AGW_URL"]);
}

export async function sendGmail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env["GOOGLE_MAIL_API_KEY"];
  const base = process.env["AGW_URL"];
  if (!key || !base) throw new Error("Gmail connector is not configured");

  const raw = base64Url(
    [`To: ${opts.to}`, `Subject: ${opts.subject}`, "Content-Type: text/plain; charset=UTF-8", "", opts.text].join(
      "\r\n",
    ),
  );

  const res = await fetch(`${base}/google_mail/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}
