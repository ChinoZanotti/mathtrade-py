// Envío de emails con Resend (https://resend.com). Si no hay RESEND_API_KEY, solo registra en consola.

// URL pública de la web (links de los emails y el logo, que se sirve desde web/public/brand).
export const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmails(mails: Mail[]): Promise<{ sent: number; failed: number }> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'Math Trade <onboarding@resend.dev>';
  if (!key) {
    console.log(`[email] RESEND_API_KEY no configurada; se omiten ${mails.length} emails`);
    return { sent: 0, failed: 0 };
  }
  // Las cuentas de prueba (`pruebaNN@mathtrade.test`) no existen: mandarles rebotaría y
  // perjudicaría la reputación del dominio en Resend.
  mails = mails.filter((m) => !/\.test$/i.test(m.to));
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (res.ok) sent += chunk.length;
    else {
      failed += chunk.length;
      console.error('[email] Resend respondió', res.status, await res.text());
    }
  }
  return { sent, failed };
}

export function layout(title: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  // Colores del estilo "Caja de juego" (web/src/styles.css).
  return `<!doctype html><html><body style="margin:0;background:#fff8ec;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#22223b">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#ffffff;border:2px solid #22223b;border-radius:18px;padding:24px">
    <img src="${APP_URL}/brand/logo-horizontal-email.png" width="220" height="60" alt="Math Trade PY" style="display:block;width:220px;height:auto;border:0">
    <!-- PNG y no SVG: Gmail y Outlook no muestran SVG. -->

    <h1 style="font-size:22px;margin:8px 0 12px">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin:24px 0 0"><a href="${ctaUrl}" style="background:#3a5bd9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700;display:inline-block">${escapeHtml(ctaLabel)}</a></p>
  </div>
  <p style="font-size:12px;color:#6b6880;text-align:center">Recibís este email porque te inscribiste en un evento de Math Trade.</p>
</div></body></html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
