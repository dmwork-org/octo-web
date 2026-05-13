import APIClient from "./APIClient"

/** target_type 枚举: 1=DM, 2=群, 5=子区 */
export const FollowTargetType = {
    DM: 1,
    CHANNEL: 2,
    THREAD: 5,
} as const

export interface FollowDmReq {
    peer_uid: string
    category_id?: number
}

export interface UnfollowChannelReq {
    group_no: string
}

export interface RefollowChannelReq {
    group_no: string
}

export interface FollowThreadReq {
    thread_channel_id: string
}

export interface SortItem {
    target_type: number
    target_id: string
    sort: number
}

export interface SortFollowsReq {
    items: SortItem[]
    version: number
}

const FollowService = {
    /** 关注 DM */
    followDM(req: FollowDmReq): Promise<void> {
        return APIClient.shared.post("/v2/follow/dm", req)
    },

    /** 取消关注 DM */
    unfollowDM(peerUid: string): Promise<void> {
        return APIClient.shared.delete("/v2/follow/dm", { param: { peer_uid: peerUid } })
    },

    /** 取消关注群 */
    unfollowChannel(req: UnfollowChannelReq): Promise<void> {
        return APIClient.shared.post("/v2/follow/channel/unfollow", req)
    },

    /** 重新关注群 */
    refollowChannel(req: RefollowChannelReq): Promise<void> {
        return APIClient.shared.post("/v2/follow/channel/refollow", req)
    },

    /** 关注子区 */
    followThread(req: FollowThreadReq): Promise<void> {
        return APIClient.shared.post("/v2/follow/thread", req)
    },

    /** 取消关注子区 */
    unfollowThread(threadChannelId: string): Promise<void> {
        return APIClient.shared.delete("/v2/follow/thread", { param: { thread_channel_id: threadChannelId } })
    },

    /** 批量排序关注项 */
    sort(req: SortFollowsReq): Promise<void> {
        return APIClient.shared.put("/v2/follow/sort", req)
    },
}

export default FollowService
