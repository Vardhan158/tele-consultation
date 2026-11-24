"""Cinematic professional HTML email templates matching Kaizen Care design system."""
from datetime import UTC, datetime


def _base_email_template(
    *,
    headline: str,
    content_html: str,
    badge_code: str | None = None,
    badge_label: str | None = None,
    action_url: str | None = None,
    action_text: str | None = None,
    note_text: str | None = None,
) -> str:
    year = datetime.now(UTC).year

    # Code badge rendering
    code_block = ""
    if badge_code:
        formatted_code = (
            " ".join(list(badge_code)) if len(badge_code) == 6 else badge_code
        )
        lbl = badge_label or "Verification Code"
        label_html = (
            f'<div style="color: #123D35; font-size: 11px; font-weight: 700; '
            f'text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">'
            f"{lbl}</div>"
        )
        code_block = (
            f'<div style="background: linear-gradient(135deg, #E8F3F3 0%, #F0F5F7 100%); '
            f'border: 2px solid #20C7A7; border-radius: 14px; padding: 24px; text-align: center; '
            f'margin: 28px 0; box-shadow: 0 6px 20px rgba(32, 199, 167, 0.15); animation: pulseGlow 3s infinite;">\n'
            f"  {label_html}\n"
            f'  <div style="color: #123D35; font-size: 34px; font-weight: 800; '
            f"letter-spacing: 10px; font-family: 'Courier New', Courier, monospace;\">"
            f"{formatted_code}</div>\n"
            f"</div>"
        )

    # Action button rendering
    action_block = ""
    if action_url and action_text:
        action_block = (
            f'<div style="text-align: center; margin: 32px 0;">\n'
            f'  <a href="{action_url}" target="_blank" style="background: linear-gradient(135deg, #123D35 0%, #176354 100%); '
            f"color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; "
            f"padding: 16px 32px; border-radius: 12px; display: inline-block; "
            f'box-shadow: 0 6px 20px rgba(18, 61, 53, 0.35); transition: transform 0.2s ease;">\n'
            f"    {action_text}\n"
            f"  </a>\n"
            f"</div>"
        )

    # Note rendering
    note_block = ""
    if note_text:
        note_block = (
            f'<div style="background-color: #FEFCE8; border-left: 4px solid #EAB308; '
            f'padding: 14px 18px; border-radius: 8px; color: #854D0E; font-size: 13px; '
            f'line-height: 1.6; margin-top: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">\n'
            f"  ⏱️ {note_text}\n"
            f"</div>"
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaizen Care</title>
  <style>
    @keyframes fadeIn {{
      from {{ opacity: 0; transform: translateY(12px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}
    @keyframes pulseGlow {{
      0% {{ box-shadow: 0 0 0 0 rgba(32, 199, 167, 0.35); }}
      70% {{ box-shadow: 0 0 0 12px rgba(32, 199, 167, 0); }}
      100% {{ box-shadow: 0 0 0 0 rgba(32, 199, 167, 0); }}
    }}
    .cinematic-card {{
      animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #EBF3F1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #162623;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #EBF3F1; padding: 50px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="cinematic-card" style="max-width: 580px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 16px 40px rgba(18, 61, 53, 0.12); border: 1px solid rgba(32, 199, 167, 0.2);">

          <!-- Brand Cinematic Header -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #123D35 0%, #176354 50%, #162623 100%); padding: 38px 24px; text-align: center;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="background: rgba(32, 199, 167, 0.2); width: 48px; height: 48px; border-radius: 14px; text-align: center; line-height: 48px; color: #20C7A7; font-size: 24px; font-weight: bold; display: inline-block; border: 1px solid rgba(32, 199, 167, 0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.1);">✚</div>
                  </td>
                  <td style="padding-left: 14px; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.4px;">Kaizen Care</span>
                  </td>
                </tr>
              </table>
              <div style="color: #20C7A7; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-top: 10px;">Cinematic Telehealth &amp; Consultation Platform</div>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding: 40px 36px;">
              <h1 style="color: #123D35; font-size: 22px; font-weight: 800; margin: 0; line-height: 1.35; letter-spacing: -0.2px;">{headline}</h1>
              <div style="color: #4A5D5A; font-size: 15px; line-height: 1.7; margin-top: 16px;">
                {content_html}
              </div>

              {code_block}
              {action_block}
              {note_block}
            </td>
          </tr>

          <!-- Footer Divider -->
          <tr>
            <td style="padding: 0 36px;">
              <hr style="border: 0; border-top: 1px solid #EBF3F1; margin: 0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 28px 36px; background-color: #F8FBFA; text-align: center;">
              <p style="color: #577877; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
                Need assistance? Contact our 24/7 care team directly in your account dashboard.
              </p>
              <p style="color: #7A9390; font-size: 11px; margin: 0; font-weight: 500;">
                &copy; {year} Kaizen Care Inc. All rights reserved. &bull;
                Encrypted & Secure Medical Telehealth
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def render_verification_email_html(code: str) -> str:
    """Renders high-converting cinematic email verification template."""
    return _base_email_template(
        headline="Verify Your Email Address",
        content_html=(
            "<p style='margin: 0;'>Welcome to <strong>Kaizen Care</strong>! "
            "Please enter the cinematic security verification code below to complete your registration "
            "and activate your secure account.</p>"
        ),
        badge_code=code,
        badge_label="Your 6-Digit Secure OTP",
        note_text="This security code will expire in <strong>10 minutes</strong> for your protection.",
    )


def render_recovery_email_html(token: str) -> str:
    """Renders cinematic password recovery email template."""
    return _base_email_template(
        headline="Reset Your Account Password",
        content_html=(
            "<p style='margin: 0;'>We received a request to securely reset your password for your "
            "<strong>Kaizen Care</strong> account. Use the authorization token below "
            "to set a new password.</p>"
        ),
        badge_code=token,
        badge_label="Password Reset Authorization Token",
        note_text=(
            "This password reset token will expire in <strong>15 minutes</strong>. "
            "If you did not request a password reset, please ignore this email securely."
        ),
    )


def render_notification_email_html(headline: str, message: str) -> str:
    """Renders cinematic generic notification email template."""
    return _base_email_template(
        headline=headline,
        content_html=f"<p style='margin: 0;'>{message}</p>",
    )
