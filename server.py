from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import asyncio
from telethon.sync import TelegramClient
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError, PhoneCodeExpiredError
import json
import os
import tempfile

app = Flask(__name__)
CORS(app)

# Serve the HTML file
@app.route('/')
def serve_index():
    return send_from_directory('.', 'session.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/sessiongen', methods=['POST', 'OPTIONS'])
def session_generator():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': 'No JSON data received'
            }), 400

        step = data.get('step')
        api_id = data.get('apiId')
        api_hash = data.get('apiHash')
        phone = data.get('phone')
        otp = data.get('otp')
        phone_code_hash = data.get('phoneCodeHash')

        if not step or not api_id or not api_hash or not phone:
            return jsonify({
                'success': False,
                'message': 'Missing required fields: step, apiId, apiHash, phone'
            }), 400

        # Run the async function
        result = asyncio.run(handle_session_generation(
            step, int(api_id), api_hash, phone, otp, phone_code_hash
        ))
        
        return jsonify(result)

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Server error: {str(e)}'
        }), 500

async def handle_session_generation(step, api_id, api_hash, phone, otp, phone_code_hash):
    try:
        if step == 'send_code':
            # Create unique session name using tempfile
            with tempfile.NamedTemporaryFile(prefix='session_', delete=False) as f:
                session_name = f.name
            
            client = TelegramClient(session_name, api_id, api_hash)
            await client.connect()
            
            result = await client.send_code_request(phone)
            
            await client.disconnect()
            
            # Cleanup
            try:
                os.unlink(session_name + '.session')
            except:
                pass
                
            return {
                'success': True,
                'message': 'Verification code sent to your Telegram!',
                'phone_code_hash': result.phone_code_hash
            }

        elif step == 'verify_otp':
            if not otp or not phone_code_hash:
                return {
                    '
