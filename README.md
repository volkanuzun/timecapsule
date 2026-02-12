# TimeCapsule

A time capsule for the future. Users can create text, image, or audio messages, choose a release date, and optionally receive an email notification when the capsule becomes public. The backend runs on .NET with Azure Blob Storage + Azure Table Storage, and the frontend is a Vite + React experience.

## Stack
- Backend: ASP.NET Core minimal APIs, Azure Blob Storage, Azure Table Storage
- Notifications: Azure Communication Services Email
- Frontend: React + Vite

## Project Layout
- `backend/TimeCapsule.Api`: API + background worker
- `frontend`: React app

## Local Development

### Backend
1. Configure Azure settings in `backend/TimeCapsule.Api/appsettings.json`:
   - `Storage.BlobConnectionString`
   - `Storage.TableConnectionString`
   - `Email.ConnectionString` and `Email.Sender` (optional)
2. Run the API:

```bash
dotnet run --project backend/TimeCapsule.Api
```

The API listens on `http://localhost:5000` by default.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:5000` so the UI can reach the backend without CORS issues.

## API

### `POST /api/messages`
Create a new capsule. Send `multipart/form-data` with:
- `title` (string, required)
- `type` (text | image | audio, required)
- `publishAt` (ISO date-time string, required)
- `textContent` (string, required when `type=text`)
- `file` (binary, required when `type=image|audio`)
- `email` (string, optional)

Audio uploads are limited to 50MB. The UI also supports recording up to 30 seconds of audio.

### `GET /api/messages/public`
Returns public messages whose `publishAt` is in the past.

## Notes
- Blobs are created with public access for easy display in the UI.
- Email notifications are sent by a background worker that polls for messages that just became public.
- The worker skips notifications if email settings are not configured.
