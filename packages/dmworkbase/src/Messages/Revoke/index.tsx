import { Channel, ChannelInfo, ChannelTypePerson, WKSDK } from "wukongimjssdk"
import { MessageCell } from '../MessageCell'
import { MessageWrap } from '../../Service/Model'
import WKApp from '../../App'
import React from 'react'
import "./index.css"
import { ChannelInfoListener } from "wukongimjssdk"
import { I18nContext, t } from "../../i18n"


export class RevokeCell extends MessageCell {
    static contextType = I18nContext
    declare context: React.ContextType<typeof I18nContext>

    channelInfoListener!:ChannelInfoListener

    componentDidMount() {
        super.componentDidMount()
        const { message } = this.props
        // 额外监听 revoker 的 channelInfo（撤回者可能与发送者不同）
        this.channelInfoListener = (channelInfo:ChannelInfo) => {
            if(channelInfo.channel.channelType === ChannelTypePerson && channelInfo.channel.channelID === message.revoker) {
                this.setState({})
            }
        }
        WKSDK.shared().channelManager.addListener(this.channelInfoListener)
    }

    componentWillUnmount() {
        super.componentWillUnmount()
        WKSDK.shared().channelManager.removeListener(this.channelInfoListener)
    }

    static tip(message: MessageWrap) {
        let name = t("base.revoke.you")
        let revoker = message.revoker
        if (revoker === WKApp.loginInfo.uid) {
            if (revoker !== message.fromUID) {
                let memberFromName = "--"
                if (message.from) {
                    memberFromName = message.from.title;
                } else {
                    WKSDK.shared().channelManager.fetchChannelInfo(new Channel(message.fromUID, ChannelTypePerson))
                }
                return t("base.revoke.revokedMemberMessageByYou", {
                    values: { member: memberFromName },
                })
            }
            return t("base.revoke.revokedMessage", { values: { name } })

        } else {
            const channel = new Channel(revoker ?? "", ChannelTypePerson)
            let channelInfo = WKSDK.shared().channelManager.getChannelInfo(new Channel(revoker ?? "", ChannelTypePerson))
            if (channelInfo) {
                name = channelInfo.title
            } else {
                WKSDK.shared().channelManager.fetchChannelInfo(channel)
                name = "--"
            }
            if (revoker !== message.fromUID) {
                return t("base.revoke.revokedMemberMessage", { values: { name } })
            }
            return t("base.revoke.revokedMessage", { values: { name } })
        }
    }

    render() {
        const { message } = this.props
        this.context.locale
        return <div className="wk-message-system">{RevokeCell.tip(message)}</div>
    }
}
