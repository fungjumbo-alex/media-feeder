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
        yt = YouTubeTranscriptApi()
        
        # List transcripts
        transcript_list = yt.list(video_id)
        
        transcript_obj = None
        
        # Try to find English
        try:
            transcript_obj = transcript_list.find_transcript(['en'])
        except:
             pass
             
        if not transcript_obj:
            # Try to find generated English
            try:
                transcript_obj = transcript_list.find_generated_transcript(['en'])
            except:
                pass
                
        if not transcript_obj:
            # Fallback to the first available one
            for t in transcript_list:
                transcript_obj = t
                break
                
        if not transcript_obj:
             return jsonify({'error': 'No transcript found for this video'}), 404
             
        transcript_data = transcript_obj.fetch()
        
        # Format the data
        formatted_transcript = []
        for item in transcript_data:
            # Check if item is a dictionary or object
            if isinstance(item, dict):
                text = item['text']
                start = item.get('start', 0)
                duration = item.get('duration', 0)
            else:
                # Assume it's an object with attributes
                text = item.text
                start = item.start
                duration = item.duration
            
            formatted_transcript.append({
                'text': text,
                'start': start,
                'duration': duration,
                'timestamp': format_timestamp(start)
            })
            
        return jsonify({
            'video_id': video_id,
            'language': transcript_obj.language_code,
            'transcript': formatted_transcript
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
