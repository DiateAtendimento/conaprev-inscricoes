import { errorResponse, jsonResponse, listFolderFiles, onlyGet, parseMeeting, parseType } from './lib/drive.mjs';

export async function handler(event) {
  const methodError = onlyGet(event);
  if (methodError) return methodError;
  try {
    const meeting = parseMeeting(event.queryStringParameters?.meeting);
    const type = parseType(event.queryStringParameters?.type);
    const { folder, files } = await listFolderFiles(meeting, type);
    return jsonResponse(200, { meeting, type, folder, files }, true);
  } catch (error) {
    return errorResponse(error, 'files');
  }
}
