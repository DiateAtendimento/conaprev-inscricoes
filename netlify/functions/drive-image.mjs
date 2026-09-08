import { authorizedFetch, driveMediaUrl, errorResponse, onlyGet, parseFileId, parseMeeting, validatePhoto } from './lib/drive.mjs';

function requestedSize(raw) {
  const value = Number(raw || 900);
  if (!Number.isInteger(value) || value < 200 || value > 1600) return 900;
  return value;
}

export async function handler(event) {
  const methodError = onlyGet(event);
  if (methodError) return methodError;
  try {
    const meeting = parseMeeting(event.queryStringParameters?.meeting);
    const fileId = parseFileId(event.queryStringParameters?.file);
    const size = requestedSize(event.queryStringParameters?.size);
    const file = await validatePhoto(meeting, fileId);

    let response;
    if (file.thumbnailLink) {
      const thumbnailUrl = String(file.thumbnailLink).replace(/=s\d+[^&]*$/, `=s${size}`);
      response = await authorizedFetch(thumbnailUrl);
    } else {
      if (Number(file.size || 0) > 5_000_000) {
        return { statusCode: 413, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'IMAGE_TOO_LARGE' }) };
      }
      response = await authorizedFetch(driveMediaUrl(file.id));
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5_500_000) {
      return { statusCode: 413, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'IMAGE_TOO_LARGE' }) };
    }
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': response.headers.get('content-type') || file.mimeType,
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
        etag: response.headers.get('etag') || `"${file.md5Checksum || `${file.id}-${file.modifiedTime || ''}`}"`,
        'x-content-type-options': 'nosniff'
      },
      body: bytes.toString('base64')
    };
  } catch (error) {
    return errorResponse(error, 'image');
  }
}
