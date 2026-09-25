import smtplib
from email.message import EmailMessage
from html import escape

from .config import settings


def build_magic_link_email(name: str | None, link: str) -> EmailMessage:
    first = (name or "").strip().split(" ")[0] if name else ""
    greeting = f"Hi {first}," if first else "Hi there,"
    ttl = settings.magic_link_ttl_hours
    msg = EmailMessage()
    msg["Subject"] = "Your Coaching Platform sign-in link"
    msg["From"] = settings.mail_from
    msg.set_content(
        f"{greeting}\n\nClick the link below to sign in to Coaching Platform and continue setting up "
        f"your coach profile:\n\n{link}\n\nThis link works once and is valid for {ttl} hours. "
        "If you didn't ask for it, you can ignore this email."
    )
    msg.add_alternative(
        f"""<!doctype html><html><body style="margin:0;background:#F6F2FC;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#241B3D;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:14px;padding:32px;"><tr><td>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:32px;height:32px;border-radius:8px;background:#6D3FA0;color:#FFFFFF;font-weight:700;text-align:center;font-size:15px;">C</td>
<td style="padding-left:10px;font-weight:700;font-size:16px;">Coaching Platform</td></tr></table>
<h1 style="font-size:22px;margin:28px 0 8px;">Your sign-in link</h1>
<p style="font-size:14.5px;color:#6B6280;margin:0 0 24px;line-height:1.5;">{escape(greeting)} click below to sign in and continue setting up your coach profile.</p>
<a href="{escape(link)}" style="display:inline-block;background:#6D3FA0;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14.5px;padding:12px 22px;border-radius:10px;">Sign in to Coaching Platform</a>
<p style="font-size:12.5px;color:#9A8FB5;margin:24px 0 0;line-height:1.5;">This link works once and is valid for {ttl} hours. If you didn't ask for it, you can ignore this email.</p>
<p style="font-size:12px;color:#9A8FB5;margin:16px 0 0;word-break:break-all;">{escape(link)}</p>
</td></tr></table></td></tr></table></body></html>""",
        subtype="html",
    )
    return msg


def send_magic_link(to: str, name: str | None, link: str):
    msg = build_magic_link_email(name, link)
    msg["To"] = to
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.send_message(msg)
