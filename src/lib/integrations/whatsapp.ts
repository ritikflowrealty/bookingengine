// WhatsApp template sending per project: DoubleTick (Sipani) or Gallabox (Riverine, Geown).
// Env naming follows the existing dashboard.flowrealty.in/api/wa relay.
// shortcut: request shapes follow the providers' public docs but are untested against live accounts; verify on first real send.

export type WaProvider = "doubletick" | "gallabox" | "none";
export type WaTarget = { provider: WaProvider; envKey?: string | null };

export async function sendTemplate(target: WaTarget, to: string, template: string, params: string[]) {
  const phone = to.startsWith("91") ? to : `91${to}`;
  if (target.provider === "doubletick") {
    const key = process.env.DOUBLETICK_API_KEY;
    if (!key) throw new Error("DOUBLETICK_API_KEY is not set");
    const res = await fetch("https://public.doubletick.io/whatsapp/message/template", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ to: phone, from: process.env.DOUBLETICK_FROM, content: { templateName: template, language: "en", templateData: { body: { placeholders: params }, buttons: [{ type: "URL", parameter: params[0] }] } } }],
      }),
    });
    if (!res.ok) throw new Error(`DoubleTick ${res.status}: ${await res.text()}`);
    return res.json();
  }
  if (target.provider === "gallabox") {
    const k = target.envKey ?? "";
    const apiKey = process.env[`${k}_KEY`];
    const apiSecret = process.env[`${k}_SECRET`];
    const channelId = process.env[`${k}_CHANNEL_ID`];
    if (!apiKey || !apiSecret || !channelId) throw new Error(`${k}_KEY / _SECRET / _CHANNEL_ID are not set`);
    const res = await fetch("https://server.gallabox.com/devapi/messages/whatsapp", {
      method: "POST",
      headers: { apiKey, apiSecret, "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        channelType: "whatsapp",
        recipient: { name: "Customer", phone },
        whatsapp: { type: "template", template: { templateName: template, bodyValues: Object.fromEntries(params.map((p, i) => [String(i + 1), p])) } },
      }),
    });
    if (!res.ok) throw new Error(`Gallabox ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error("No WhatsApp provider configured for this project");
}
