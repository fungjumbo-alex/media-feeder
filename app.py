from flask import Flask, jsonify, request, send_file
from youtube_transcript_api import YouTubeTranscriptApi
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
    data = request.get_json()
    url = data.get('url')
    
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
        print(f"[Backend] Fetching transcript for video_id: {video_id}")
        yt = YouTubeTranscriptApi()
        
        # List transcripts
        try:
            transcript_list = yt.list_transcripts(video_id)
        except Exception as e:
            print(f"[Backend] list_transcripts failed for {video_id}: {str(e)}")
            return jsonify({'error': f'Could not list transcripts: {str(e)}'}), 404
        
        transcript_obj = None
        
        # Priority 1: Manual English
        # Priority 2: Generated English
        # Priority 3: First available manual
        # Priority 4: First available generated
        
        manual_transcripts = [t for t in transcript_list if not t.is_generated]
        generated_transcripts = [t for t in transcript_list if t.is_generated]
        
        # Try manual English
        for t in manual_transcripts:
            if t.language_code.startswith('en'):
                transcript_obj = t
                print(f"[Backend] Found manual English transcript: {t.language_code}")
                break
                
        if not transcript_obj:
            # Try generated English
            for t in generated_transcripts:
                if t.language_code.startswith('en'):
                    transcript_obj = t
                    print(f"[Backend] Found generated English transcript: {t.language_code}")
                    break
                    
        if not transcript_obj:
            # Fallback to any manual
            if manual_transcripts:
                transcript_obj = manual_transcripts[0]
                print(f"[Backend] Falling back to manual {transcript_obj.language_code}")
            elif generated_transcripts:
                transcript_obj = generated_transcripts[0]
                print(f"[Backend] Falling back to generated {transcript_obj.language_code}")
                
        if not transcript_obj:
             print(f"[Backend] No transcripts found at all for {video_id}")
             return jsonify({'error': 'No transcript found for this video'}), 404
             
        transcript_data = transcript_obj.fetch()
        print(f"[Backend] Successfully fetched {len(transcript_data)} lines for {video_id}")
        
        # Format the data
        formatted_transcript = []
        for item in transcript_data:
            formatted_transcript.append({
                'text': item['text'],
                'start': item['start'],
                'duration': item.get('duration', 0),
                'timestamp': format_timestamp(item['start'])
            })
            
        return jsonify({
            'video_id': video_id,
            'language': transcript_obj.language_code,
            'is_generated': transcript_obj.is_generated,
            'transcript': formatted_transcript
        })
    except Exception as e:
        error_msg = str(e)
        print(f"[Backend] CRITICAL ERROR for {video_id}: {error_msg}")
        return jsonify({'error': error_msg}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
