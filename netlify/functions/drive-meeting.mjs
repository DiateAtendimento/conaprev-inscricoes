import { errorResponse, jsonResponse, onlyGet, parseMeeting, resolveAllFolders } from './lib/drive.mjs';

export async function handler(event) {
  const methodError = onlyGet(event);
  if (methodError) return methodError;
  try {
    const meeting = parseMeeting(event.queryStringParameters?.meeting);
    const { meetingFolder, folders } = await resolveAllFolders(meeting);
    return jsonResponse(200, {
      meeting,
      folder: { id: meetingFolder.id, name: meetingFolder.name },
      folders
    }, true);
  } catch (error) {
    return errorResponse(error, 'meeting');
  }
}
