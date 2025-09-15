# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Set up Environment Variables:**

    Create a file named `.env.local` in the root of the project and add the following variables.

    ```
    # Your Google Gemini API Key is required for all AI features.
    # Get one from Google AI Studio: https://aistudio.google.com/app/apikey
    API_KEY="YOUR_GEMINI_API_KEY"

    # (Optional) Your YouTube Data API Key is used as a fallback for fetching
    # some video details if public sources fail.
    # Get one from your Google Cloud project.
    YOUTUBE_API_KEY="YOUR_YOUTUBE_API_KEY"

    # (Optional) Your Google Client ID for OAuth is required for YouTube
    # account features like importing subscriptions and liking videos.
    # Get one from your Google Cloud project's "Credentials" page.
    GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
    ```

3.  **Run the app:**
    ```bash
    npm run dev
    ```

## License
This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.