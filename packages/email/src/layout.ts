import { brand } from "@repo/config";
import { escapeHtml } from "@repo/shared";

export interface LayoutOptions {
  preheader: string;
  heading: string;
  /** Paragraphs of plain text; escaped before rendering. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  details?: Array<{ label: string; value: string }>;
  footerNote?: string;
  brandColor?: string;
  companyName?: string;
}

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Responsive, table-based email layout that renders in major clients
 * (Gmail, Outlook, Apple Mail). All dynamic text is HTML-escaped.
 */
export function renderLayout(options: LayoutOptions): { html: string; text: string } {
  const color =
    options.brandColor && SAFE_COLOR.test(options.brandColor) ? options.brandColor : "#0F766E";
  const sender = escapeHtml(options.companyName ?? brand.productName);
  const details = options.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #E5E7EB;border-radius:10px;">${options.details
        .map(
          (d) =>
            `<tr><td style="padding:10px 16px;font-size:13px;color:#6B7280;width:40%;">${escapeHtml(d.label)}</td><td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(d.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const cta = options.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="border-radius:8px;background:${color};"><a href="${escapeHtml(options.cta.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(options.cta.label)}</a></td></tr></table><p style="font-size:12px;color:#6B7280;margin:0 0 16px;">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all;color:#374151;">${escapeHtml(options.cta.url)}</span></p>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
<tr><td style="padding:20px 32px;border-bottom:1px solid #F3F4F6;font-size:15px;font-weight:700;color:#111827;">${sender}</td></tr>
<tr><td style="padding:28px 32px 8px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(options.heading)}</h1>
${options.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(p)}</p>`).join("")}
${details}${cta}
</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;line-height:1.5;color:#9CA3AF;">${escapeHtml(options.footerNote ?? `Sent by ${brand.productName} on behalf of ${options.companyName ?? "the hiring team"}.`)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    options.heading,
    "",
    ...options.paragraphs,
    "",
    ...(options.details ?? []).map((d) => `${d.label}: ${d.value}`),
    ...(options.cta ? ["", `${options.cta.label}: ${options.cta.url}`] : []),
    "",
    options.footerNote ?? `Sent by ${brand.productName}.`,
  ].join("\n");

  return { html, text };
}
