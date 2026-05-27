import React, { Component, ReactNode } from "react";
import RouteContext from "../../Service/Context";
import Provider, { IProviderListener } from "../../Service/Provider";
import RoutePage from "../RoutePage";
import { MeInfoVM } from "./vm";
import "./index.css"
import Sections from "../Sections";
import { I18nContext } from "../../i18n";

export interface MeInfoProps {
    onClose: ()=>void
}

export  class MeInfo extends Component<MeInfoProps> {
    static contextType = I18nContext
    declare context: React.ContextType<typeof I18nContext>


    render() {
        const { onClose } = this.props
        const title = this.context.t("base.meInfo.title")
        return <Provider create={function (): IProviderListener {
            return new MeInfoVM()
        }} render={function (vm: MeInfoVM): ReactNode {
            return <RoutePage title={title} onClose={()=>{
                if(onClose) {
                    onClose()
                }
            }} render={function (context: RouteContext<any>): ReactNode {

                return <div className="wk-meinfo">
                    <div className="wk-meinfo-sections">
                        <Sections sections={vm.sections(context)}></Sections>
                    </div>
                </div>

            }}></RoutePage>
        }}></Provider>
    }
}
