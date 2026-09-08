import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'viewer', space: 'B', handler: vi.fn(), get: vi.fn(), api: vi.fn() }));
vi.mock('../../../App', () => ({ default: {
  get loginInfo() { return { uid: mock.uid }; },
  shared: { get currentSpaceId() { return mock.space; } },
  endpointManager: { get: mock.get },
} }));
vi.mock('../../../Service/APIClient', () => ({ default: { shared: { get: mock.api } } }));
import { fetchDocPreview } from '../preview';
import { DocumentShareCardContent } from '../DocumentShareCardContent';

beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'viewer'; mock.space = 'B';
  mock.get.mockReturnValue({ handler: mock.handler });
});
it('round-trips PPT as type 18 without embedding preview or source content', () => {
  const card = new DocumentShareCardContent();
  card.docId = 'd_ppt'; card.kind = 'html_ppt'; card.title = 'Slides';
  const wire = card.encodeJSON();
  const decoded = new DocumentShareCardContent(); decoded.decodeJSON(wire);
  expect(wire.type).toBe(18); expect(decoded.kind).toBe('html_ppt');
  expect(Object.keys(wire)).toEqual(['type', 'doc_id', 'space_id', 'kind', 'title', 'owner_name', 'updated_at', 'url', 'permission']);
});
it('routes to the module using recipient Space, ignores sender Space, and never reuses ACL results', async () => {
  mock.handler.mockResolvedValueOnce({ status: 'ready', preview: { type: 'doc', heading: 'First slide', paragraphs: ['Body'] } });
  const preview = await fetchDocPreview('html_ppt', 'd_ppt', 'forged_sender_space');
  expect(preview.status).toBe('ready');
  expect(mock.get).toHaveBeenCalledWith('docs.sharePreview.html_ppt');
  expect(mock.handler).toHaveBeenCalledWith({ docId: 'd_ppt', spaceId: 'B' });
  mock.handler.mockResolvedValueOnce({ status: 'denied' });
  expect(await fetchDocPreview('html_ppt', 'd_ppt', 'forged_sender_space')).toEqual({ status: 'denied' });
  expect(mock.api).not.toHaveBeenCalled();
});
it('fails closed with no provider or authenticated viewer context', async () => {
  mock.get.mockReturnValue(undefined);
  expect(await fetchDocPreview('html_ppt', 'd_ppt', 'A')).toEqual({ status: 'error' });
  mock.uid = '';
  expect(await fetchDocPreview('html_ppt', 'd_ppt', 'A')).toEqual({ status: 'denied' });
  expect(mock.handler).not.toHaveBeenCalled();
});
it('drops a pending preview after recipient switches Space', async () => {
  mock.handler.mockImplementation(async () => { mock.space = 'C'; return { status: 'ready' }; });
  expect(await fetchDocPreview('html_ppt', 'd_ppt', 'A')).toEqual({ status: 'denied' });
});
