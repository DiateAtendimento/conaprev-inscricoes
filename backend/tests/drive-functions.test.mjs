import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { handler as meetingHandler } from '../../netlify/functions/drive-meeting.mjs';
import { handler as filesHandler } from '../../netlify/functions/drive-files.mjs';
import { handler as imageHandler } from '../../netlify/functions/drive-image.mjs';
import documentHandler from '../../netlify/functions/drive-document.mjs';
import { normalizePrivateKey } from '../../netlify/functions/lib/drive.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.GOOGLE_PROJECT_ID = 'drive-functions-test';
process.env.GOOGLE_CLIENT_EMAIL = 'test@example.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'root-folder-test';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json' }
});

test('normaliza chave PEM multilinha, JSON e duplamente escapada', () => {
  const pem = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----';
  assert.equal(normalizePrivateKey(pem), pem);
  assert.equal(normalizePrivateKey(JSON.stringify(pem)), pem);
  assert.equal(normalizePrivateKey(pem.replace(/\n/g, '\\\\n')), pem);
});

global.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.href === 'https://oauth2.googleapis.com/token') {
    return json({ access_token: 'unit-test-token', expires_in: 3600 });
  }
  if (url.hostname === 'thumbnail.test') {
    return new Response(Buffer.from('test-image'), { status: 200, headers: { 'content-type': 'image/jpeg', etag: '"image-etag"' } });
  }
  if (url.pathname.endsWith('/files/presentation-file') && url.searchParams.get('alt') === 'media') {
    return new Response(Buffer.from('%PDF-test'), { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': '9' } });
  }
  if (url.pathname.endsWith('/files/presentation-file')) {
    return json({ id: 'presentation-file', name: 'Apresentação.pdf', mimeType: 'application/pdf', parents: ['presentations-id'], trashed: false, size: '9' });
  }
  if (url.pathname.endsWith('/files/photo-file-ok')) {
    return json({ id: 'photo-file-ok', name: 'foto.jpg', mimeType: 'image/jpeg', parents: ['photos-id'], trashed: false, size: '10', modifiedTime: '2026-01-01T00:00:00Z', thumbnailLink: 'https://thumbnail.test/photo=s220' });
  }
  if (url.pathname.endsWith('/files/photo-outside')) {
    return json({ id: 'photo-outside', name: 'fora.jpg', mimeType: 'image/jpeg', parents: ['other-folder'], trashed: false, size: '10' });
  }
  if (url.pathname.endsWith('/files')) {
    const q = url.searchParams.get('q') || '';
    if (q.includes("name = '999-Reuniao-CONAPREV'")) return json({ files: [] });
    if (q.includes("name = '84-Reuniao-CONAPREV'")) return json({ files: [] });
    if (q.includes("name = '85-Reuniao-CONAPREV'")) return json({ files: [{ id: 'meeting-85-id', name: '85-Reuniao-CONAPREV', mimeType: 'application/vnd.google-apps.folder' }] });
    if (q.includes("name = 'Apresentacoes'")) return json({ files: [{ id: 'presentations-id', name: 'Apresentacoes', mimeType: 'application/vnd.google-apps.folder' }] });
    if (q.includes("name = 'fotos'")) return json({ files: [{ id: 'photos-id', name: 'fotos', mimeType: 'application/vnd.google-apps.folder' }] });
    if (q.includes("name = 'Atas'")) return json({ files: [{ id: 'minutes-id', name: 'Atas', mimeType: 'application/vnd.google-apps.folder' }] });
    if (q.includes("'presentations-id' in parents")) return json({ files: [{ id: 'presentation-file', name: 'Apresentação.pdf', mimeType: 'application/pdf', size: '100', modifiedTime: '2026-01-01T00:00:00Z', webViewLink: 'https://drive.google.com/file/presentation-file', iconLink: 'https://drive.google.com/icon' }] });
    if (q.includes("'photos-id' in parents")) return json({ files: [{ id: 'photo-file-ok', name: 'foto.jpg', mimeType: 'image/jpeg', modifiedTime: '2026-01-01T00:00:00Z' }, { id: 'not-image', name: 'arquivo.pdf', mimeType: 'application/pdf' }] });
    if (q.includes("'minutes-id' in parents")) return json({ files: [] });
    if (q.includes("'root-folder-test' in parents") && !q.includes('name =')) return json({ files: [{ id: 'meeting-84-id', name: '84-Reunião-CONAPREV', mimeType: 'application/vnd.google-apps.folder' }] });
  }
  if (url.pathname.endsWith('/files/root-folder-direct')) {
    return json({ id: 'root-folder-direct', name: '83ª Reunião Ordinária do CONAPREV', mimeType: 'application/vnd.google-apps.folder', trashed: false });
  }
  if (url.pathname.endsWith('/files/root-folder-test')) {
    return json({ id: 'root-folder-test', name: 'Reunioes-CONAPREV', mimeType: 'application/vnd.google-apps.folder', trashed: false });
  }
  return json({ error: 'unexpected mock request' }, 500);
};

test('rejeita método e parâmetros não autorizados', async () => {
  assert.equal((await meetingHandler({ httpMethod: 'POST' })).statusCode, 405);
  assert.equal((await meetingHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '../85' } })).statusCode, 400);
  assert.equal((await filesHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', type: 'qualquer-pasta' } })).statusCode, 400);
  assert.equal((await imageHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', file: 'x' } })).statusCode, 400);
});

test('localiza a reunião e apenas as três subpastas previstas', async () => {
  const response = await meetingHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85' } });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(Object.keys(body.folders).sort(), ['minutes', 'photos', 'presentations']);
  assert.equal(body.folders.photos.id, 'photos-id');
});

test('tolera acentos no nome da pasta sem sair da pasta raiz', async () => {
  const response = await meetingHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '84' } });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).folder.name, '84-Reunião-CONAPREV');
});

test('aceita o ID raiz apontando diretamente para a pasta da reunião', async () => {
  const originalRoot = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = 'root-folder-direct';
  try {
    const response = await meetingHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '83' } });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).folder.name, '83ª Reunião Ordinária do CONAPREV');
  } finally {
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = originalRoot;
  }
});

test('lista apresentações e trata pasta vazia', async () => {
  const presentations = await filesHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', type: 'presentations' } });
  assert.equal(presentations.statusCode, 200);
  assert.equal(JSON.parse(presentations.body).files[0].name, 'Apresentação.pdf');
  const minutes = await filesHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', type: 'minutes' } });
  assert.deepEqual(JSON.parse(minutes.body).files, []);
});

test('lista somente imagens e bloqueia arquivo fora da pasta autorizada', async () => {
  const photos = await filesHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', type: 'photos' } });
  assert.deepEqual(JSON.parse(photos.body).files.map((file) => file.id), ['photo-file-ok']);
  const denied = await imageHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', file: 'photo-outside' } });
  assert.equal(denied.statusCode, 403);
});

test('entrega thumbnail validada com tipo e cache', async () => {
  const response = await imageHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '85', file: 'photo-file-ok', size: '800' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.isBase64Encoded, true);
  assert.equal(response.headers['content-type'], 'image/jpeg');
  assert.match(response.headers['cache-control'], /s-maxage=86400/);
});

test('entrega documento pelo site sem expor o link privado do Drive', async () => {
  const response = await documentHandler(new Request('https://site.test/.netlify/functions/drive-document?meeting=85&type=presentations&file=presentation-file'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /^inline;/);
  assert.equal(await response.text(), '%PDF-test');
});

test('retorna erro seguro para reunião inexistente', async () => {
  const response = await meetingHandler({ httpMethod: 'GET', queryStringParameters: { meeting: '999' } });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'MEETING_NOT_FOUND' });
});
