/**
 * Shared, email-client-safe building blocks for every OpenExam Hub email (founder alerts in
 * lib/signupAlert.js, learner emails in lib/userEmails.js): brand tokens from the site
 * (src/landing/theme.js, src/index.css, public/favicon.svg), HTML escaping and one branded shell.
 * Tables + inline CSS, light/dark aware, no images (the OE tile is a coloured table cell).
 */
export const SITE_URL = 'https://openexamhub.org';

export const BRAND = {
  cream: '#F7F5F0',
  paper: '#FFFFFF',
  sand: '#EDE7DD',
  line: '#E7DFD3',
  ink: '#1A1714',
  muted: '#5C554C',
  soft: '#8A8178',
  accent: '#C2410C',
  accentDark: '#9A3412',
  peach: '#E7C9B4',
  tileFrom: '#FF7A1A',
  tileTo: '#FF4F8B',
  serif: "Fraunces, Georgia, Cambria, 'Times New Roman', serif",
  sans: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** <head> styles shared by all emails (responsive + dark mode overrides keyed on oeh-* classes). */
export const EMAIL_STYLE = `<style>
  body { margin:0; padding:0; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }
  @media (max-width: 620px) {
    .oeh-container { width:100% !important; }
    .oeh-pad { padding-left:22px !important; padding-right:22px !important; }
    .oeh-h1 { font-size:30px !important; line-height:36px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .oeh-bg { background-color:#141210 !important; }
    .oeh-card { background-color:#1F1C19 !important; border-color:#34302B !important; }
    .oeh-stat { background-color:#26221E !important; border-color:#34302B !important; }
    .oeh-ink { color:#F7F5F0 !important; }
    .oeh-muted { color:#C9BFB3 !important; }
    .oeh-accent { color:#FB923C !important; }
    .oeh-row { border-color:#34302B !important; }
  }
  [data-ogsc] .oeh-ink { color:#F7F5F0 !important; }
  [data-ogsc] .oeh-muted { color:#C9BFB3 !important; }
</style>`;

export function wordmarkRow() {
  const B = BRAND;
  return `<tr>
          <td class="oeh-pad" style="padding:0 8px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="36" height="36" align="center" valign="middle" bgcolor="${B.tileFrom}" style="width:36px;height:36px;border-radius:10px;background-color:${B.tileFrom};background-image:linear-gradient(135deg,${B.tileFrom},${B.tileTo});font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:36px;font-weight:700;color:#FFFFFF;text-align:center;">OE</td>
                <td class="oeh-ink" style="padding-left:10px;font-family:${B.sans};font-size:17px;font-weight:600;letter-spacing:-0.2px;color:${B.ink};">OpenExam Hub</td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/** Pill button (bulletproof: the whole cell is coloured, the link is padded). */
export function buttonHtml(href, label) {
  const B = BRAND;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${B.accent}" style="border-radius:999px;background-color:${B.accent};">
                        <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${B.sans};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;white-space:nowrap;">${esc(label)}&nbsp;&rarr;</a>
                      </td>
                    </tr>
                  </table>`;
}

export const p = (html, extra = '') =>
  `<p class="oeh-muted" style="margin:14px 0 0;font-family:${BRAND.sans};font-size:16px;line-height:26px;color:${BRAND.muted};${extra}">${html}</p>`;
export const strong = (s) => `<strong class="oeh-ink" style="color:${BRAND.ink};">${esc(s)}</strong>`;
export const link = (href, label) => `<a class="oeh-accent" href="${esc(href)}" target="_blank" style="color:${BRAND.accent};font-weight:600;text-decoration:underline;">${esc(label)}</a>`;

/**
 * Full branded email.
 * @param {object} o
 * @param {string} o.lang          html lang
 * @param {string} o.title         <title> (usually the subject)
 * @param {string} o.preheader     inbox preview text (plain)
 * @param {string} o.eyebrow       small caps label above the headline (plain)
 * @param {string} o.headline      serif H1 (plain)
 * @param {string} o.bodyHtml      trusted HTML rows content (already escaped)
 * @param {string} o.footerHtml    trusted HTML footer (already escaped)
 */
export function renderEmailShell({ lang = 'en', title, preheader, eyebrow, headline, bodyHtml, footerHtml }) {
  const B = BRAND;
  return `<!DOCTYPE html>
<html lang="${esc(lang)}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
${EMAIL_STYLE}
</head>
<body class="oeh-bg" style="margin:0;padding:0;background-color:${B.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${B.cream};">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" class="oeh-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.cream};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <table role="presentation" class="oeh-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        ${wordmarkRow()}
        <tr>
          <td>
            <table role="presentation" class="oeh-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${B.paper}" style="border-collapse:separate;border-spacing:0;background-color:${B.paper};border:1px solid ${B.line};border-radius:24px;">
              <tr><td height="6" style="height:6px;line-height:6px;font-size:0;background-color:${B.accent};background-image:linear-gradient(90deg,${B.tileFrom},${B.accent} 55%,${B.tileTo});border-radius:23px 23px 0 0;">&nbsp;</td></tr>
              <tr>
                <td class="oeh-pad" style="padding:34px 40px 36px;">
                  <div class="oeh-accent" style="font-family:${B.sans};font-size:12px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${B.accentDark};">${esc(eyebrow)}</div>
                  <h1 class="oeh-h1 oeh-ink" style="margin:12px 0 0;font-family:${B.serif};font-size:36px;line-height:42px;font-weight:500;letter-spacing:-0.8px;color:${B.ink};">${esc(headline)}</h1>
                  ${bodyHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="oeh-pad oeh-muted" style="padding:22px 8px 0;font-family:${B.sans};font-size:12px;line-height:19px;color:${B.soft};">
            ${footerHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
