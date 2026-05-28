
import React, { Component } from 'react';
import clsName from 'classnames';
import { I18nContext } from '../../i18n';
export default class PopupMenus extends Component<any> {
    static contextType = I18nContext;
    declare context: React.ContextType<typeof I18nContext>;


    render() {
        const { hiddenMulti, hiddenRevoke, onMultiple,hiddenFavorites,onFavorites, onForward, onMessageRevoke, onMessageDelete, hiddenComment, onCommentClick } = this.props;
        const { t } = this.context;

        return (
            <div className="wk-popupmenus">
                {/* 评论 */}
                {
                    !hiddenComment ? (<div title={t("base.popupMenus.reply")} className={clsName("wk-popupmenus-item", "wk-popupmenus-comment")} onClick={onCommentClick}>
                    </div>) : null
                }
                {/* 点赞 */}
                {/* <div className={clsName(style.menusItem, style.like)} onClick={onReactionClick} onMouseOver={onReactionOver} onMouseOut={onReactionOut}>
                </div> */}
                {/* 转发 */}
                <div title={t("base.popupMenus.forward")} className={clsName("wk-popupmenus-item", "wk-popupmenus-forward")} onClick={onForward}>
                </div>
                {/* {
                    !hiddenCopy?( <div title="复制" className={clsName(style.menusItem, style.copy)} onClick={onCopy}>
                    </div>):null
                } */}
                {
                    !hiddenFavorites?( <div title={t("base.popupMenus.favorite")} className={clsName("wk-popupmenus-item", "wk-popupmenus-favorites")} onClick={onFavorites}>
                    </div>):null
                }
               
                {/* 删除消息 */}
                <div title={t("base.popupMenus.delete")} className={clsName("wk-popupmenus-item", "wk-popupmenus-delete")} onClick={onMessageDelete}>
                </div>
                {/* 多选 */}
                {
                    !hiddenMulti ? (<div title={t("base.popupMenus.multiSelect")} data-testid="popup-menu-multiselect" className={clsName("wk-popupmenus-item", "wk-popupmenus-mulselect")} onClick={onMultiple}>
                    </div>) : null
                }
                {/* 撤回 */}
                {
                    !hiddenRevoke ? (<div title={t("base.popupMenus.revoke")} className={clsName("wk-popupmenus-item", "wk-popupmenus-revoke")} onClick={onMessageRevoke}>
                    </div>) : null
                }

            </div>
        );
    }
}
