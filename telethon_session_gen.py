import asyncio
from telethon.sync import TelegramClient
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError, PhoneCodeExpiredError
import sys, json, os

async def main():
    try:
        data = json.loads(sys.stdin.read())
        step = data.get("step")
        api_id = int(data.get("apiId"))
        api_hash = data.get("apiHash")
        phone = data.get("phone")
        otp = data.get("otp")
        phone_code_hash = data.get("phoneCodeHash")

        if step == "send_code":
            # Create unique session name
            session_name = "session_" + phone.replace("+", "").replace(" ", "")
            client = TelegramClient(session_name, api_id, api_hash)
            await client.connect()
            result = await client.send_code_request(phone)
            print(json.dumps({
                "success": True, 
                "message": "Verification code sent to your Telegram!",
                "phone_code_hash": result.phone_code_hash
            }))
            await client.disconnect()

        elif step == "verify_otp":
            session_name = "session_" + phone.replace("+", "").replace(" ", "")
            client = TelegramClient(session_name, api_id, api_hash)
            await client.connect()
            
            try:
                # Sign in with the code
                await client.sign_in(
                    phone=phone, 
                    code=otp, 
                    phone_code_hash=phone_code_hash
                )
                session_string = await client.session.save()
                
                print(json.dumps({
                    "success": True, 
                    "session_string": session_string,
                    "message": "Session generated successfully!"
                }))
                
            except SessionPasswordNeededError:
                print(json.dumps({
                    "success": False,
                    "message": "2FA password required. Please disable 2FA or use another account."
                }))
            except PhoneCodeInvalidError:
                print(json.dumps({
                    "success": False,
                    "message": "Invalid verification code. Please try again."
                }))
            except PhoneCodeExpiredError:
                print(json.dumps({
                    "success": False,
                    "message": "Verification code expired. Please request a new code."
                }))
            except Exception as e:
                print(json.dumps({
                    "success": False,
                    "message": f"Error during verification: {str(e)}"
                }))
            
            await client.disconnect()
            
            # Clean up session file
            try:
                session_file = f"{session_name}.session"
                if os.path.exists(session_file):
                    os.remove(session_file)
            except:
                pass

    except Exception as e:
        print(json.dumps({
            "success": False,
            "message": f"Unexpected error: {str(e)}"
        }))

if __name__ == "__main__":
    asyncio.run(main())
