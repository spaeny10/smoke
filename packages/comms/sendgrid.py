import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

def send_email(to_email: str, subject: str, html_content: str, from_email: str = "hello@smoke.io") -> bool:
    """
    Sends an email using SendGrid. Returns True if successful.
    """
    api_key = os.environ.get('SENDGRID_API_KEY')
    if not api_key:
        print(f"Mock SendGrid Email to {to_email}: {subject}")
        return True
        
    message = Mail(
        from_email=from_email,
        to_emails=to_email,
        subject=subject,
        html_content=html_content)
        
    try:
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        print(f"SendGrid Response: {response.status_code}")
        return response.status_code in [200, 201, 202]
    except Exception as e:
        print(f"SendGrid Error: {e}")
        return False
