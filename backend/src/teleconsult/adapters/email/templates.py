"""Professional HTML email templates matching Kaizentrix Care design system."""
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
            f'<div style="color: #577877; font-size: 11px; font-weight: 600; '
            f'text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px;">'
            f"{lbl}</div>"
        )
        code_block = (
            f'<div style="background-color: #FFFFFF; border: 2px dashed #295255; '
            f'border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">\n'
            f"  {label_html}\n"
            f'  <div style="color: #295255; font-size: 32px; font-weight: 800; '
            f"letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;\">"
            f"{formatted_code}</div>\n"
            f"</div>"
        )

    # Action button rendering
    action_block = ""
    if action_url and action_text:
        action_block = (
            f'<div style="text-align: center; margin: 28px 0;">\n'
            f'  <a href="{action_url}" target="_blank" style="background-color: #295255; '
            f"color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; "
            f"padding: 14px 28px; border-radius: 10px; display: inline-block; "
            f'box-shadow: 0 4px 12px rgba(41, 82, 85, 0.25);">\n'
            f"    {action_text}\n"
            f"  </a>\n"
            f"</div>"
        )

    # Note rendering
    note_block = ""
    if note_text:
        note_block = (
            f'<div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B; '
            f'padding: 12px 16px; border-radius: 6px; color: #92400E; font-size: 13px; '
            f'line-height: 1.5; margin-top: 20px;">\n'
            f"  ⏱️ {note_text}\n"
            f"</div>"
        )

    header_style = (
        "background: linear-gradient(135deg, #295255 0%, #162623 100%); "
        "padding: 32px 24px; text-align: center;"
    )
    badge_icon_style = (
        "background-color: rgba(255, 255, 255, 0.18); width: 42px; height: 42px; "
        "border-radius: 10px; text-align: center; line-height: 42px; color: #ffffff; "
        "font-size: 22px; font-weight: bold; display: inline-block;"
    )
    card_style = (
        "max-width: 560px; background-color: #ffffff; border-radius: 16px; "
        "overflow: hidden; box-shadow: 0 10px 25px rgba(22, 38, 35, 0.08); "
        "border: 1px solid rgba(87, 120, 119, 0.18);"
    )
    body_style = (
        "margin: 0; padding: 0; background-color: #F0F5F7; "
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, "
        "Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #162623;"
    )
    sub_title_style = (
        "color: rgba(240, 245, 247, 0.82); font-size: 11px; font-weight: 600; "
        "text-transform: uppercase; letter-spacing: 1.5px; margin-top: 8px;"
    )
    h1_style = (
        "color: #162623; font-size: 20px; font-weight: 700; "
        "margin: 0 0 16px 0; line-height: 1.3;"
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kaizentrix Care</title>
</head>
<body style="{body_style}">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
         style="background-color: #F0F5F7; padding: 40px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
               style="{card_style}">

          <!-- Brand Header -->
          <tr>
            <td align="center" style="{header_style}">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="{badge_icon_style}">✚</div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 22px; font-weight: 700;
                                 letter-spacing: -0.3px;">Kaizentrix Care</span>
                  </td>
                </tr>
              </table>
              <div style="{sub_title_style}">Telehealth & Consultation Platform</div>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <h1 style="{h1_style}">{headline}</h1>
              <div style="color: #577877; font-size: 15px; line-height: 1.6;">
                {content_html}
              </div>

              {code_block}
              {action_block}
              {note_block}
            </td>
          </tr>

          <!-- Footer Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: 0; border-top: 1px solid #F0F5F7; margin: 0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #FAFCFD; text-align: center;">
              <p style="color: #577877; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
                Need assistance? Contact our support team directly in your account dashboard.
              </p>
              <p style="color: #577877; font-size: 11px; margin: 0; opacity: 0.75;">
                &copy; {year} Kaizentrix Care Inc. All rights reserved. &bull;
                Confidential & Secure Medical Telehealth
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
    """Renders high-converting, professional email verification template."""
    return _base_email_template(
        headline="Verify Your Email Address",
        content_html=(
            "<p style='margin: 0;'>Welcome to <strong>Kaizentrix Care</strong>! "
            "Please enter the security verification code below to complete your registration "
            "and activate your account.</p>"
        ),
        badge_code=code,
        badge_label="Your 6-Digit OTP Code",
        note_text="This security code will expire in <strong>10 minutes</strong>.",
    )


def render_recovery_email_html(token: str) -> str:
    """Renders password recovery email template."""
    return _base_email_template(
        headline="Reset Your Account Password",
        content_html=(
            "<p style='margin: 0;'>We received a request to reset your password for your "
            "<strong>Kaizentrix Care</strong> account. Use the authorization token below "
            "to set a new password.</p>"
        ),
        badge_code=token,
        badge_label="Password Reset Authorization Token",
        note_text=(
            "This password reset token will expire in <strong>15 minutes</strong>. "
            "If you did not request a password reset, please ignore this email."
        ),
    )


def render_notification_email_html(headline: str, message: str) -> str:
    """Renders generic notification email template."""
    return _base_email_template(
        headline=headline,
        content_html=f"<p style='margin: 0;'>{message}</p>",
    )
