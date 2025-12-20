from flask import Flask, jsonify, request, send_file
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import IpBlocked, TranscriptsDisabled, NoTranscriptFound, VideoUnavailable
import re

app = Flask(__name__, static_folder='.')

def extract_video_id(url):
    """
    Examples:
    - http://youtu.be/SA2iWivDJiE
    - http://www.youtube.com/watch?v=_oPAwA_Udwc&feature=feedu
    - http://www.youtube.com/embed/SA2iWivDJiE
    - http://www.youtube.com/v/SA2iWivDJiE?version=3&hl=en_US
    """
    query = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', url)
    if query:
        return query.group(1)
    return None

def format_timestamp(seconds):
    seconds = int(seconds)
    minutes = seconds // 60
    remaining_seconds = seconds % 60
    return f"{minutes:02d}:{remaining_seconds:02d}"

@app.route('/')
def index():
    return send_file('index.html')


@app.route('/api/transcript', methods=['POST'])
def get_transcript():
    print(f"[Backend] Received request: {request.method} {request.url}", flush=True)
    try:
        data = request.get_json(silent=True)
        if not data:
            print("[Backend] Error: No JSON data received or invalid JSON", flush=True)
            return jsonify({'error': 'JSON body is required'}), 400
        url = data.get('url')
    except Exception as e:
        print(f"[Backend] JSON Parse Error: {str(e)}", flush=True)
        return jsonify({'error': 'Invalid JSON'}), 400
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    video_id = extract_video_id(url)
    if not video_id:
        # Fallback: maybe the user provided just the ID
        if len(url) == 11:
            video_id = url
        else:
             return jsonify({'error': 'Invalid YouTube URL'}), 400
    
    try:
        # Instantiate the API class
        print(f"[Backend] Fetching transcript for video_id: {video_id}", flush=True)
        yt = YouTubeTranscriptApi()
        
        # List transcripts
        try:
            transcript_list = yt.list(video_id)
        except IpBlocked as e:
            print(f"[Backend] IP Blocked error for {video_id}: {str(e)}", flush=True)
            return jsonify({
                'error': 'YouTube is blocking this server\'s IP. Try a different fetching method.',
                'code': 'IP_BLOCKED',
                'video_id': video_id
            }), 429
        except TranscriptsDisabled as e:
            print(f"[Backend] Transcripts disabled for {video_id}", flush=True)
            return jsonify({'error': 'Subtitles are disabled for this video', 'code': 'TRANSCRIPTS_DISABLED'}), 404
        except NoTranscriptFound as e:
            print(f"[Backend] No transcript found for {video_id}", flush=True)
            return jsonify({'error': 'No transcript found for this video', 'code': 'NO_TRANSCRIPT_FOUND'}), 404
        except VideoUnavailable as e:
            print(f"[Backend] Video unavailable: {video_id}", flush=True)
            return jsonify({'error': 'Video is unavailable', 'code': 'VIDEO_UNAVAILABLE'}), 404
        except Exception as e:
            err_str = str(e)
            print(f"[Backend] Generic list_transcripts failure for {video_id}: {err_str}", flush=True)
            if "status code 429" in err_str or "CAPTCHA" in err_str or "IpBlocked" in err_str:
                 return jsonify({
                    'error': 'Bot detection triggered. YouTube is blocking this server.',
                    'code': 'IP_BLOCKED'
                 }), 429
            return jsonify({'error': f'Could not list transcripts: {err_str}'}), 500
        
        transcript_obj = None
        
        # Priority 1: Manual English
        # Priority 2: Generated English
        # Priority 3: Manual other language (translated to English if possible?)
        # Priority 4: First available
        
        manual_transcripts = [t for t in transcript_list if not t.is_generated]
        generated_transcripts = [t for t in transcript_list if t.is_generated]
        
        print(f"[Backend] Found {len(manual_transcripts)} manual and {len(generated_transcripts)} generated transcripts.")

        # Try manual English
        for t in manual_transcripts:
            if t.language_code.startswith('en'):
                transcript_obj = t
                print(f"[Backend] Selected manual English ({t.language_code})", flush=True)
                break
                
        if not transcript_obj:
            # Try generated English
            for t in generated_transcripts:
                if t.language_code.startswith('en'):
                    transcript_obj = t
                    print(f"[Backend] Selected generated English ({t.language_code})", flush=True)
                    break
                    
        if not transcript_obj:
            # Fallback to any manual then any generated
            if manual_transcripts:
                transcript_obj = manual_transcripts[0]
                print(f"[Backend] Falling back to manual ({transcript_obj.language_code})")
            elif generated_transcripts:
                transcript_obj = generated_transcripts[0]
                print(f"[Backend] Falling back to generated ({transcript_obj.language_code})")
                
        if not transcript_obj:
             print(f"[Backend] No transcripts found at all for {video_id}", flush=True)
             return jsonify({'error': 'No transcript found for this video'}), 404
             
        transcript_data = transcript_obj.fetch()
        print(f"[Backend] Successfully fetched {len(transcript_data)} lines for {video_id}", flush=True)
        
        # Format the data
        formatted_transcript = []
        for item in transcript_data:
            formatted_transcript.append({
                'text': item.text,
                'start': item.start,
                'duration': item.duration,
                'timestamp': format_timestamp(item.start)
            })
            
        return jsonify({
            'video_id': video_id,
            'language': transcript_obj.language_code,
            'is_generated': transcript_obj.is_generated,
            'transcript': formatted_transcript
        })
    except Exception as e:
        import traceback
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        print(f"[Backend] CRITICAL ERROR for {video_id}: {error_msg}", flush=True)
        print(stack_trace, flush=True)
        
        if "Could not retrieve a transcript" in error_msg or "IpBlocked" in error_msg or "status code 429" in error_msg:
            print(f"[Backend] IP Blocked catch-all for {video_id}", flush=True)
            return jsonify({
                'error': 'YouTube is blocking this server\'s IP. Try a different fetching method.',
                'code': 'IP_BLOCKED',
                'video_id': video_id
            }), 429
            
        return jsonify({
            'error': error_msg,
            'details': 'Check Python console for full stack trace',
            'video_id': video_id
        }), 500

@app.errorhandler(404)
def page_not_found(e):
    print(f"[Backend] 404 NOT FOUND: {request.method} {request.url}", flush=True)
    return jsonify(error="Not Found", method=request.method, url=request.url), 404

if __name__ == '__main__':
    app.run(debug=True, port=5001)
