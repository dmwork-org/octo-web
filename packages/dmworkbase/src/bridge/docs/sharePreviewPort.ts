import WKApp from '../../App';
import type { DocShareKind } from '../../ui/DocumentShareCard';
import type { DocPreviewResult } from '../../Messages/DocumentShareCard/preview';

/** Private modules supply preview providers; the host owns no private source API. */
export async function fetchModuleSharePreview(kind: DocShareKind, docId: string): Promise<DocPreviewResult> {
  const uid = WKApp.loginInfo?.uid;
  const spaceId = WKApp.shared.currentSpaceId;
  if (!uid || !spaceId) return { status: 'denied' };
  const endpoint = WKApp.endpointManager?.get(`docs.sharePreview.${kind}`);
  if (!endpoint?.handler) return { status: 'error' };
  try {
    const result = await endpoint.handler({ docId, spaceId }) as DocPreviewResult;
    if (uid !== WKApp.loginInfo?.uid || spaceId !== WKApp.shared.currentSpaceId) return { status: 'denied' };
    return result;
  } catch {
    return { status: 'error' };
  }
}
