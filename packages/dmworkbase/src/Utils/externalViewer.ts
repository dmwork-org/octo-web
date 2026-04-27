// YUJ-64: 外部成员/消息来源的"按当前 Space 视角渲染"公共判定逻辑。
//
// 背景：
//   后端 YUJ-63 为成员列表和 /message/channel/sync 新增了 home_space_id /
//   home_space_name（消息侧为 from_home_space_id / from_home_space_name）字段，
//   表示该用户真正的归属 Space。前端不再把 is_external 当作绝对值，而是按
//   "归属 Space 与当前查看 Space 是否一致" 判断：
//
//     isExternalToViewer = homeSpaceId && homeSpaceId !== viewerSpaceId
//
// 降级兼容：
//   - 后端 home_space_id 缺失（老数据 / 未升级实例）时，回落到旧的
//     is_external === 1 + source_space_name 组合。
//   - 当 homeSpaceId 存在但 homeSpaceName 缺失时，依然视作外部，但标签无来源文本。

import WKApp from "../App"

export interface ExternalViewerInput {
  /** 新字段：成员真实归属 Space ID（YUJ-63 后端扩展） */
  homeSpaceId?: string | null
  /** 新字段：成员真实归属 Space 名称 */
  homeSpaceName?: string | null
  /** 旧字段：绝对值意义上的"外部"标记，用于降级兼容 */
  isExternalLegacy?: number | null
  /** 旧字段：外部来源 Space 名称，用于降级兼容 */
  sourceSpaceNameLegacy?: string | null
  /** 当前查看 Space ID；默认读 WKApp.shared.currentSpaceId */
  viewerSpaceId?: string | null
}

export interface ExternalViewerResult {
  /** 是否相对当前查看 Space 显示为外部成员 */
  isExternal: boolean
  /** 标签下显示的来源 Space 名称（可能为空字符串） */
  sourceSpaceName: string
}

/**
 * 根据当前查看 Space 判定成员/消息来源是否为"外部"，并返回来源 Space 名称。
 * 优先使用新字段 home_space_id / home_space_name，缺失时降级到老字段。
 */
export function resolveExternalForViewer(
  input: ExternalViewerInput
): ExternalViewerResult {
  const viewerSpaceId =
    input.viewerSpaceId ?? WKApp.shared.currentSpaceId ?? ""
  const homeId = (input.homeSpaceId ?? "") as string
  const homeName = (input.homeSpaceName ?? "") as string

  if (homeId && homeId.length > 0) {
    // 新行为：按归属 Space 与当前 Space 的关系判定
    const isExternal = homeId !== viewerSpaceId
    return {
      isExternal,
      sourceSpaceName: isExternal ? homeName : "",
    }
  }

  // 降级兼容：后端 home_space_id 为空（老数据），回落旧逻辑
  const legacyIsExternal = input.isExternalLegacy === 1
  const legacySource = (input.sourceSpaceNameLegacy ?? "") as string
  if (legacyIsExternal) {
    return { isExternal: true, sourceSpaceName: legacySource }
  }
  return { isExternal: false, sourceSpaceName: "" }
}
