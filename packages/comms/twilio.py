import os
from twilio.rest import Client

def send_sms(to_phone: str, body_text: str) -> bool:
    """
    Sends an SMS using Twilio. Returns True if successful.
    """
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_phone = os.environ.get('TWILIO_PHONE_NUMBER', "+1234567890")
    
    if not account_sid or not auth_token:
        print(f"Mock Twilio SMS to {to_phone}: {body_text}")
        return True
        
    try:
        client = Client(account_sid, auth_token)
        message = client.messages.create(
            body=body_text,
            from_=from_phone,
            to=to_phone
        )
        print(f"Twilio Message SID: {message.sid}")
        return True
    except Exception as e:
        print(f"Twilio Error: {e}")
        return False
