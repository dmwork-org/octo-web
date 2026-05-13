import { useCallback } from "react"
import { Toast } from "@douyinfe/semi-ui"
import FollowService from "../Service/FollowService"

export interface UseFollowStateResult {
    /** 关注 DM */
    followDM: (peerUid: string, categoryId?: number) => Promise<void>
    /** 取消关注 DM */
    unfollowDM: (peerUid: string) => Promise<void>
    /** 取消关注群 */
    unfollowChannel: (groupNo: string) => Promise<void>
    /** 重新关注群 */
    refollowChannel: (groupNo: string) => Promise<void>
    /** 关注子区 */
    followThread: (threadChannelId: string) => Promise<void>
    /** 取消关注子区 */
    unfollowThread: (threadChannelId: string) => Promise<void>
}

export function useFollowState(): UseFollowStateResult {
    const followDM = useCallback(async (peerUid: string, categoryId?: number) => {
        try {
            await FollowService.followDM({ peer_uid: peerUid, category_id: categoryId })
            Toast.success("已添加到关注")
        } catch (e: any) {
            Toast.error(e?.msg || "关注失败")
            throw e
        }
    }, [])

    const unfollowDM = useCallback(async (peerUid: string) => {
        try {
            await FollowService.unfollowDM(peerUid)
            Toast.success("已取消关注")
        } catch (e: any) {
            Toast.error(e?.msg || "取消关注失败")
            throw e
        }
    }, [])

    const unfollowChannel = useCallback(async (groupNo: string) => {
        try {
            await FollowService.unfollowChannel({ group_no: groupNo })
            Toast.success("已取消关注")
        } catch (e: any) {
            Toast.error(e?.msg || "取消关注失败")
            throw e
        }
    }, [])

    const refollowChannel = useCallback(async (groupNo: string) => {
        try {
            await FollowService.refollowChannel({ group_no: groupNo })
            Toast.success("已添加到关注")
        } catch (e: any) {
            Toast.error(e?.msg || "关注失败")
            throw e
        }
    }, [])

    const followThread = useCallback(async (threadChannelId: string) => {
        try {
            await FollowService.followThread({ thread_channel_id: threadChannelId })
            Toast.success("已关注子区")
        } catch (e: any) {
            Toast.error(e?.msg || "关注失败")
            throw e
        }
    }, [])

    const unfollowThread = useCallback(async (threadChannelId: string) => {
        try {
            await FollowService.unfollowThread(threadChannelId)
            Toast.success("已取消关注子区")
        } catch (e: any) {
            Toast.error(e?.msg || "取消关注失败")
            throw e
        }
    }, [])

    return {
        followDM,
        unfollowDM,
        unfollowChannel,
        refollowChannel,
        followThread,
        unfollowThread,
    }
}
