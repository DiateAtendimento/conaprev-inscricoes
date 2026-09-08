import {
  authorizedFetch,
  DriveFunctionError,
  driveExportUrl,
  driveMediaUrl,
  parseFileId,
  parseMeeting,
  parseType,
  validateDocument
} from './lib/drive.mjs';

const GOOGLE_FILE_PREFIX = 'application/vnd.google-apps.';
const PDF_EXPORT_TYPES = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.drawing'
]);

function safeFileName(value, exportedAsPdf) {
  const cleaned = String(value || 'documento')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim() || 'documento';
  return exportedAsPdf && !cleaned.toLowerCase().endsWith('.pdf')
    ? `${cleaned}.pdf`
    : cleaned;
}

function errorResponse(error) {
  const known = error instanceof DriveFunctionError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  console.error('[drive:document]', { code, status });
  return Response.json({ error: code }, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'METHOD_NOT_ALLOWED' }, {
      status: 405,
      headers: { allow: 'GET', 'cache-control': 'no-store' }
    });
  }

  try {
    const url = new URL(request.url);
    const meeting = parseMeeting(url.searchParams.get('meeting'));
    const type = parseType(url.searchParams.get('type'));
    const fileId = parseFileId(url.searchParams.get('file'));
    const file = await validateDocument(meeting, type, fileId);
    const isGoogleFile = String(file.mimeType).startsWith(GOOGLE_FILE_PREFIX);
    if (isGoogleFile && !PDF_EXPORT_TYPES.has(file.mimeType)) {
      throw new DriveFunctionError('FILE_PREVIEW_UNAVAILABLE', 415);
    }

    const exportedAsPdf = isGoogleFile;
    const range = exportedAsPdf ? null : request.headers.get('range');
    const upstream = await authorizedFetch(
      exportedAsPdf ? driveExportUrl(file.id) : driveMediaUrl(file.id),
      range ? { headers: { range } } : {}
    );
    const fileName = safeFileName(file.name, exportedAsPdf);
    const headers = new Headers({
      'content-type': upstream.headers.get('content-type') || (exportedAsPdf ? 'application/pdf' : file.mimeType),
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'public, max-age=300, s-maxage=3600',
      'x-content-type-options': 'nosniff'
    });
    ['accept-ranges', 'content-length', 'content-range', 'etag', 'last-modified'].forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    });

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
