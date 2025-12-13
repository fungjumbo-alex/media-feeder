from firebase_functions import https_fn
from firebase_admin import initialize_app
from youtube_transcript_api import YouTubeTranscriptApi
import re
import json

initialize_app()

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
    # Set CORS headers for the preflight request
    if req.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return https_fn.Response('', status=204, headers=headers)

    # Set CORS headers for the main request
    headers = {
        'Access-Control-Allow-Origin': '*'
    }

    if req.method != 'POST':
        return https_fn.Response("Method not allowed", status=405, headers=headers)

    try:
        data = req.get_json()
        if not data or 'url' not in data:
            return https_fn.Response(json.dumps({'error': 'Missing URL in request body'}), status=400, headers=headers, mimetype='application/json')
            
        url = data['url']
        video_id = get_video_id(url)
        
        if not video_id:
            return https_fn.Response(json.dumps({'error': 'Invalid YouTube URL'}), status=400, headers=headers, mimetype='application/json')
            
        # Instantiate the API
        transcript_list = YouTubeTranscriptApi().list(video_id)
        
        try:
            transcript = transcript_list.find_transcript(['en'])
        except:
            transcript = next(iter(transcript_list))
            
        transcript_data = transcript.fetch()
        return https_fn.Response(json.dumps(transcript_data), status=200, headers=headers, mimetype='application/json')
        
    except Exception as e:
        return https_fn.Response(json.dumps({'error': str(e)}), status=500, headers=headers, mimetype='application/json')
