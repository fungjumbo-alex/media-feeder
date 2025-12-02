---
description: Deploy to Google Cloud (Firebase Hosting)
---

# Deploy Media Feeder to Google Cloud

This workflow covers deploying your Vite + React application to Google Cloud using **Firebase Hosting** (recommended for static sites).

## Prerequisites

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Ensure you have a Google Cloud project: `ai-reader-465723`

## Deployment Steps

### Option 1: Firebase Hosting (Recommended)

#### 1. Build the production bundle
```bash
npm run build
```

#### 2. Login to Firebase
```bash
firebase login
```

#### 3. Initialize Firebase in your project
```bash
firebase init hosting
```

When prompted:
- **Select project**: Choose existing project `ai-reader-465723`
- **Public directory**: Enter `dist` (this is where Vite builds to)
- **Configure as single-page app**: Yes
- **Set up automatic builds with GitHub**: Optional (choose based on preference)
- **Overwrite index.html**: No

#### 4. Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

Your app will be live at: `https://ai-reader-465723.web.app` or `https://ai-reader-465723.firebaseapp.com`

---

### Option 2: Cloud Storage + Cloud CDN (Alternative)

#### 1. Build the production bundle
```bash
npm run build
```

#### 2. Create a Cloud Storage bucket
```bash
gcloud storage buckets create gs://media-feeder-app --project=ai-reader-465723 --location=us-central1
```

#### 3. Make the bucket publicly accessible
```bash
gcloud storage buckets add-iam-policy-binding gs://media-feeder-app --member=allUsers --role=roles/storage.objectViewer
```

#### 4. Configure bucket for web hosting
```bash
gcloud storage buckets update gs://media-feeder-app --web-main-page-suffix=index.html --web-error-page=index.html
```

#### 5. Upload the built files
```bash
gcloud storage cp -r dist/* gs://media-feeder-app
```

Your app will be accessible at: `https://storage.googleapis.com/media-feeder-app/index.html`

---

### Option 3: Cloud Run (For Containerized Deployment)

#### 1. Create a Dockerfile (see separate instructions below)

#### 2. Build and deploy to Cloud Run
```bash
gcloud run deploy media-feeder --source . --project=ai-reader-465723 --region=us-central1 --allow-unauthenticated
```

---

## Important Notes

### Environment Variables
Your `.env.local` file is NOT included in the build. You need to:

1. **For Firebase/Cloud Storage**: Environment variables must be prefixed with `VITE_` to be included in the build:
   - Rename `API_KEY` to `VITE_API_KEY` in your code
   - Rename `YOUTUBE_API_KEY` to `VITE_YOUTUBE_API_KEY`
   - Rename `GOOGLE_CLIENT_ID` to `VITE_GOOGLE_CLIENT_ID`
   - Access them in code with `import.meta.env.VITE_API_KEY`

2. **For Cloud Run**: Use environment variables in the deployment command:
```bash
gcloud run deploy media-feeder --set-env-vars "API_KEY=your-key,YOUTUBE_API_KEY=your-key"
```

### Custom Domain
To use a custom domain with Firebase Hosting:
```bash
firebase hosting:channel:deploy production --expires 30d
```

Then configure your domain in the Firebase Console.

---

## Troubleshooting

- **Build fails**: Check that all dependencies are installed with `npm install`
- **404 errors**: Ensure SPA configuration is set correctly (all routes should serve index.html)
- **API keys not working**: Verify environment variables are prefixed with `VITE_` for Vite builds
- **Permission denied**: Run `gcloud auth login` and ensure you have proper permissions on the project
