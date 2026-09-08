import { createSign } from 'node:crypto';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CACHE_TTL_MS = 5 * 60 * 1000;
const SUBFOLDERS = Object.freeze({
  presentations: 'Apresentacoes',
  photos: 'fotos',
  minutes: 'Atas'
});

let tokenCache = { token: '', expiresAt: 0 };
const valueCache = new Map();

export class DriveFunctionError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.name = 'DriveFunctionError';
    this.code = code;
    this.status = status;
  }
}

export function normalizePrivateKey(rawValue) {
  let value = String(rawValue || '').trim();
  if (!value) return '';

  // Aceita tanto PEM multilinha quanto o valor copiado do JSON da Service Account.
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }

  return value
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

function requiredEnvironment() {
  const projectId = process.env.GOOGLE_PROJECT_ID?.trim();
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!projectId || !clientEmail || !privateKey || !rootFolderId) {
    throw new DriveFunctionError('DRIVE_NOT_CONFIGURED', 503);
  }
  return { projectId, clientEmail, privateKey, rootFolderId };
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const { clientEmail, privateKey } = requiredEnvironment();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  let signature;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    signature = signer.sign(privateKey).toString('base64url');
  } catch {
    throw new DriveFunctionError('DRIVE_CREDENTIALS_INVALID', 503);
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`
    })
  });
  if (!response.ok) throw new DriveFunctionError('DRIVE_AUTH_FAILED', 503);
  const data = await response.json();
  if (!data.access_token) throw new DriveFunctionError('DRIVE_AUTH_FAILED', 503);
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000
  };
  return tokenCache.token;
}

export async function authorizedFetch(url, options = {}) {
  const token = await accessToken();
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${token}` }
    });
  } catch {
    throw new DriveFunctionError('DRIVE_UNAVAILABLE', 503);
  }
  if (response.status === 401) {
    tokenCache = { token: '', expiresAt: 0 };
    throw new DriveFunctionError('DRIVE_AUTH_FAILED', 503);
  }
  if (response.status === 403) throw new DriveFunctionError('DRIVE_ACCESS_DENIED', 503);
  if (response.status === 404) throw new DriveFunctionError('DRIVE_ITEM_NOT_FOUND', 404);
  if (!response.ok) throw new DriveFunctionError('DRIVE_UNAVAILABLE', 503);
  return response;
}

async function driveJson(path, params = {}) {
  const query = new URLSearchParams(params);
  const response = await authorizedFetch(`${DRIVE_API}${path}?${query}`);
  return response.json();
}

function cached(key, loader) {
  const current = valueCache.get(key);
  if (current && current.expiresAt > Date.now()) return current.promise;
  const promise = Promise.resolve().then(loader).catch((error) => {
    valueCache.delete(key);
    throw error;
  });
  valueCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, promise });
  return promise;
}

function quoteQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function canonicalFolderName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+)\s*(?:a|ª|º)(?=[^a-z0-9]|$)/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isMeetingFolderName(value, meeting) {
  const parts = canonicalFolderName(value).split('-').filter(Boolean);
  return parts[0] === String(meeting)
    && parts.includes('reuniao')
    && parts.includes('conaprev');
}

export function parseMeeting(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,3}$/.test(text)) throw new DriveFunctionError('INVALID_MEETING', 400);
  const meeting = Number(text);
  if (!Number.isInteger(meeting) || meeting < 1 || meeting > 999) {
    throw new DriveFunctionError('INVALID_MEETING', 400);
  }
  return meeting;
}

export function parseType(raw) {
  const type = String(raw ?? '').trim();
  if (!Object.hasOwn(SUBFOLDERS, type)) throw new DriveFunctionError('INVALID_TYPE', 400);
  return type;
}

export function parseFileId(raw) {
  const id = String(raw ?? '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new DriveFunctionError('INVALID_FILE', 400);
  return id;
}

async function findFolder(parentId, name, fallbackMatcher = null) {
  const q = `'${quoteQueryValue(parentId)}' in parents and name = '${quoteQueryValue(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const data = await driveJson('/files', {
    q,
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    pageSize: '2',
    fields: 'files(id,name,mimeType)'
  });
  const exact = Array.isArray(data.files) ? data.files[0] || null : null;
  if (exact) return exact;

  // Fallback controlado: continua limitado ao parent autorizado e apenas tolera
  // acentos, caixa, espaços e separadores diferentes no nome da pasta.
  const siblings = await driveJson('/files', {
    q: `'${quoteQueryValue(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    pageSize: '1000',
    fields: 'files(id,name,mimeType)'
  });
  const target = canonicalFolderName(name);
  if (!Array.isArray(siblings.files)) return null;
  const canonicalMatch = siblings.files.find((folder) => canonicalFolderName(folder.name) === target);
  if (canonicalMatch) return canonicalMatch;
  if (typeof fallbackMatcher !== 'function') return null;

  // Evita escolher silenciosamente a pasta errada se houver mais de uma variação.
  const compatible = siblings.files.filter(fallbackMatcher);
  return compatible.length === 1 ? compatible[0] : null;
}

async function getFolder(folderId) {
  const folder = await driveJson(`/files/${encodeURIComponent(folderId)}`, {
    fields: 'id,name,mimeType,trashed',
    supportsAllDrives: 'true'
  });
  return folder
    && folder.mimeType === FOLDER_MIME
    && folder.trashed !== true
    ? folder
    : null;
}

export function resolveMeeting(meeting) {
  return cached(`meeting:${meeting}`, async () => {
    const { rootFolderId } = requiredEnvironment();
    const expectedName = `${meeting}-Reuniao-CONAPREV`;
    const folder = await findFolder(
      rootFolderId,
      expectedName,
      (candidate) => isMeetingFolderName(candidate.name, meeting)
    );
    if (folder) return folder;

    // Também aceita uma configuração em que o próprio ID raiz é a pasta da
    // reunião, mas somente quando nome e tipo confirmam a reunião solicitada.
    const configuredRoot = await getFolder(rootFolderId);
    if (configuredRoot && isMeetingFolderName(configuredRoot.name, meeting)) {
      return configuredRoot;
    }
    throw new DriveFunctionError('MEETING_NOT_FOUND', 404);
  });
}

export function resolveSubfolder(meeting, type, required = true) {
  return cached(`folder:${meeting}:${type}`, async () => {
    const meetingFolder = await resolveMeeting(meeting);
    const folder = await findFolder(meetingFolder.id, SUBFOLDERS[type]);
    if (!folder && required) throw new DriveFunctionError('FOLDER_NOT_FOUND', 404);
    return folder;
  });
}

export async function resolveAllFolders(meeting) {
  const meetingFolder = await resolveMeeting(meeting);
  const entries = await Promise.all(Object.keys(SUBFOLDERS).map(async (type) => {
    const folder = await resolveSubfolder(meeting, type, false);
    return [type, folder ? { ...folder, webViewLink: folderLink(folder.id) } : null];
  }));
  return { meetingFolder, folders: Object.fromEntries(entries) };
}

export async function listFolderFiles(meeting, type) {
  const folder = await resolveSubfolder(meeting, type, true);
  const filters = [`'${quoteQueryValue(folder.id)}' in parents`, 'trashed = false'];
  if (type !== 'photos') filters.push(`mimeType != '${FOLDER_MIME}'`);

  const files = [];
  let pageToken = '';
  do {
    const data = await driveJson('/files', {
      q: filters.join(' and '),
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      pageSize: '1000',
      orderBy: 'name_natural',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)',
      ...(pageToken ? { pageToken } : {})
    });
    if (Array.isArray(data.files)) files.push(...data.files);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  const safeFiles = files
    .filter((file) => type !== 'photos' || String(file.mimeType).startsWith('image/'))
    .map((file) => type === 'photos'
      ? { id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime }
      : {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size || null,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink || null,
          iconLink: file.iconLink || null
        });
  safeFiles.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  return { folder: { id: folder.id, name: folder.name, webViewLink: folderLink(folder.id) }, files: safeFiles };
}

export async function validatePhoto(meeting, fileId) {
  const folder = await resolveSubfolder(meeting, 'photos', true);
  const file = await driveJson(`/files/${encodeURIComponent(fileId)}`, {
    fields: 'id,name,mimeType,parents,trashed,modifiedTime,md5Checksum,size,thumbnailLink',
    supportsAllDrives: 'true'
  });
  if (file.trashed || !String(file.mimeType || '').startsWith('image/') || !Array.isArray(file.parents) || !file.parents.includes(folder.id)) {
    throw new DriveFunctionError('FILE_NOT_AUTHORIZED', 403);
  }
  return file;
}

export function driveMediaUrl(fileId) {
  return `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
}

export function folderLink(id) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

export function jsonResponse(statusCode, body, cache = false) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=60' : 'no-store',
      'x-content-type-options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

export function errorResponse(error, context) {
  const known = error instanceof DriveFunctionError;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const status = known ? error.status : 500;
  console.error(`[drive:${context}]`, { code, status });
  return jsonResponse(status, { error: code });
}

export function onlyGet(event) {
  if (event.httpMethod === 'GET') return null;
  return { statusCode: 405, headers: { allow: 'GET', 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) };
}
