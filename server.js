const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'session.html'));
});

// API endpoint for session generation
app.post('/api/sessiongen', async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: "Only POST method allowed" });
  }

  const { step, apiId, apiHash, phone, otp, phoneCodeHash } = req.body;
  
  if (!step || !apiId || !apiHash || !phone) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields: step, apiId, apiHash, phone" 
    });
  }

  if (step === "verify_otp" && (!otp || !phoneCodeHash)) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields for verification: otp, phoneCodeHash" 
    });
  }

  const scriptPath = path.join(__dirname, "telethon_session_gen.py");

  // Create Python script if it doesn't exist
  if (!fs.existsSync(scriptPath)) {
    const pythonScript = `
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
`;
    fs.writeFileSync(scriptPath, pythonScript.trim());
    console.log('Python script created at:', scriptPath);
  }

  return new Promise((resolve) => {
    const py = spawn("python", [scriptPath]);
    let output = "";
    let errorOutput = "";

    py.stdin.write(JSON.stringify({ step, apiId, apiHash, phone, otp, phoneCodeHash }));
    py.stdin.end();

    py.stdout.on("data", (data) => {
      output += data.toString();
    });

    py.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.error("Python stderr:", data.toString());
    });

    py.on("close", (code) => {
      try {
        if (output) {
          const result = JSON.parse(output);
          res.status(200).json(result);
        } else {
          res.status(500).json({
            success: false,
            message: "No response from session generator",
            error: errorOutput
          });
        }
      } catch (parseError) {
        console.error("Parse error:", parseError);
        res.status(500).json({
          success: false,
          message: "Failed to parse response",
          output: output,
          error: errorOutput
        });
      }
      resolve();
    });

    py.on("error", (error) => {
      console.error("Spawn error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to start session generator",
        error: error.message
      });
      resolve();
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (!res.headersSent) {
        py.kill();
        res.status(500).json({
          success: false,
          message: "Session generation timeout (60s)"
        });
        resolve();
      }
    }, 60000);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});
