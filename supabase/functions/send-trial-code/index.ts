import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'Lizzie at Big Picture Planner <hello@bigpictureplanner.app>';
const APP_URL = 'https://drlizlondon.github.io/big-picture-planner/';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { email, code, position } = await req.json();

  if (!email || !code) {
    return new Response(JSON.stringify({ error: 'Missing email or code' }), { status: 400 });
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9f8ff;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f8ff;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e8e8e8;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#5B35F5;padding:32px;text-align:center;">
              <p style="margin:0;color:rgba(255,255,255,0.65);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Big Picture Planner</p>
              <h1 style="margin:10px 0 0;color:#ffffff;font-size:24px;font-weight:900;letter-spacing:-0.02em;line-height:1.3;">
                You're in &#x1F389;
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.7;">
                Thanks for signing up to the waitlist${position ? ' — you&apos;re #' + position : ''}. Here&apos;s your access code to get four weeks completely free.
              </p>

              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
                We&apos;d love to get your feedback — anything that works well, anything that&apos;s confusing, anything you wish it did. Just reply to this email.
              </p>

              <!-- Code block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="background:#f0ecff;border:2px dashed #5B35F5;border-radius:12px;padding:24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#5B35F5;">Your access code</p>
                    <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:0.2em;color:#0f0f0f;font-family:Courier New,monospace;">${code}</p>
                    <p style="margin:8px 0 0;font-size:12px;color:#888;">4 weeks free &bull; no card needed</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.7;font-weight:600;">How to get started:</p>
              <ol style="margin:0 0 28px;padding-left:20px;font-size:14px;color:#555;line-height:2.2;">
                <li>Open Big Picture Planner</li>
                <li>Sign in with Google or your email</li>
                <li>Enter the code above when prompted</li>
              </ol>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}" style="display:inline-block;background:#5B35F5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:100px;letter-spacing:-0.01em;">
                      Open Big Picture Planner &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 24px;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#bbb;line-height:1.7;">
                Lizzie &bull; Big Picture Planner<br/>
                Just reply to this email if you need anything.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Thanks for signing up to the waitlist${position ? ` — you're #${position}` : ''}. Here's your access code to get four weeks completely free.

Your access code: ${code}

We'd love to get your feedback — anything that works well, anything that's confusing, anything you wish it did. Just reply to this email.

To get started:
1. Open Big Picture Planner: ${APP_URL}
2. Sign in with Google or your email
3. Enter the code above when prompted

— Lizzie, Big Picture Planner`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: `Your Big Picture Planner access code: ${code}`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
