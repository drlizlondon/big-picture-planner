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
<body style="margin:0;padding:0;background:#f9f8ff;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f8ff;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e8e8e8;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#5B35F5;padding:32px;text-align:center;">
              <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Big Picture Planner</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-0.02em;">Your access code is ready</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 20px;font-size:16px;color:#333;line-height:1.6;">
                Hi${position ? ' #' + position : ''} 👋
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.7;">
                You're in! Here's your access code for <strong>28 days free</strong> on Big Picture Planner — the planner that helps you fit it all in, like Tetris for your actual life.
              </p>

              <!-- Code block -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td align="center" style="background:#f0ecff;border:2px dashed #5B35F5;border-radius:12px;padding:24px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#5B35F5;">Your access code</p>
                    <p style="margin:0;font-size:34px;font-weight:900;letter-spacing:0.15em;color:#0f0f0f;font-family:monospace;">${code}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.7;">To get started:</p>
              <ol style="margin:0 0 28px;padding-left:20px;font-size:14px;color:#555;line-height:2;">
                <li>Open the planner</li>
                <li>Sign in with Google or your email</li>
                <li>Enter your code when prompted</li>
                <li>Your 28-day free trial begins immediately</li>
              </ol>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}" style="display:inline-block;background:#5B35F5;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:100px;">
                      Open Big Picture Planner &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e8e8e8;text-align:center;">
              <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
                You're receiving this because you joined the Big Picture Planner waitlist.<br/>
                Built with &#x2665; by Lizzie
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
