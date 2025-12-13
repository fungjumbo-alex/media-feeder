from youtube_transcript_api import YouTubeTranscriptApi
import re
import json

def get_video_id(url):
    """
    Extracts the video ID from a YouTube URL.
    """
    regex = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(regex, url)
    if match:
        return match.group(1)
    return None

def handler(event, context):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }

    if event['httpMethod'] == 'OPTIONS':
        return {
            'statusCode': 204,
            'headers': headers,
            'body': ''
        }

    if event['httpMethod'] != 'POST':
        return {
            'statusCode': 405,
            'headers': headers,
            'body': 'Method Not Allowed'
        }

    try:
        data = json.loads(event['body'])
        if not data or 'url' not in data:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing URL in request body'})
            }
            
        url = data['url']
        video_id = get_video_id(url)
        
        if not video_id:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Invalid YouTube URL'})
            }
            
        # Instantiate the API
        transcript_list = YouTubeTranscriptApi().list(video_id)
        
        try:
            transcript = transcript_list.find_transcript(['en'])
        except:
            transcript = next(iter(transcript_list))
            
        transcript_data = transcript.fetch()
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(transcript_data)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }
