from firebase_functions import https_fn
from firebase_admin import initialize_app
from youtube_transcript_api import YouTubeTranscriptApi
import re
import json
import os

initialize_app()

ALLOWED_ORIGINS = [
    'https://media-feeder.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000',
]

def get_allowed_origin(request):
    origin = request.headers.get('Origin', '')
    return origin if origin in ALLOWED_ORIGINS else ''

def get_video_id(url):
    """
    Extracts the video ID from a YouTube URL.
    """
    regex = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(regex, url)
    if match:
        return match.group(1)
    return None

@https_fn.on_request()
def transcript(req: https_fn.Request) -> https_fn.Response:
    origin = get_allowed_origin(req)
    cors_headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600',
    }
    if origin:
        cors_headers['Vary'] = 'Origin'

    # Set CORS headers for the preflight request
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers=cors_headers)

    if req.method != 'POST':
        return https_fn.Response("Method not allowed", status=405, headers=cors_headers)

    try:
        data = req.get_json()
        if not data or 'url' not in data:
            return https_fn.Response(
                json.dumps({'error': 'Missing URL in request body'}),
                status=400,
                headers=cors_headers,
                mimetype='application/json',
            )

        url = data['url']
        video_id = get_video_id(url)

        if not video_id:
            return https_fn.Response(
                json.dumps({'error': 'Invalid YouTube URL'}),
                status=400,
                headers=cors_headers,
                mimetype='application/json',
            )

        # Instantiate the API
        transcript_list = YouTubeTranscriptApi().list(video_id)

        try:
            transcript = transcript_list.find_transcript(['en'])
        except:
            transcript = next(iter(transcript_list))

        transcript_data = transcript.fetch()
        return https_fn.Response(
            json.dumps(transcript_data),
            status=200,
            headers=cors_headers,
            mimetype='application/json',
        )

    except Exception as e:
        # Log full error server-side only
        print(f"[Firebase transcript] Error: {e}")
        # Return sanitized error to client
        return https_fn.Response(
            json.dumps({'error': 'Transcript request failed', 'code': 'GENERIC_ERROR'}),
            status=500,
            headers=cors_headers,
            mimetype='application/json',
        )
