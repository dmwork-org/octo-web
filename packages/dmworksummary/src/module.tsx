import React from "react";
import type { IModule } from "@octo/base/src/Service/Module";
import { i18n, WKApp, Menus, t } from "@octo/base";
import SummaryListPage from "./pages/SummaryListPage";
import SummaryCreatePage from "./pages/SummaryCreatePage";
import SummaryDetailPage from "./pages/SummaryDetailPage";
import SummaryConfirmPage from "./pages/SummaryConfirmPage";
import ScheduleListPage from "./pages/ScheduleListPage";
import { getChatCandidates } from "./api/summaryApi";
import enUS from "./i18n/en-US.json";
import zhCN from "./i18n/zh-CN.json";
import "./index.css";

let _spaceChangedHandler: (() => void) | null = null;
let _badgeCount = 0;

/** Summary NavRail icon — AI sparkle / document */
const SummaryIcon: React.FC<{ active?: boolean }> = ({ active }) => (
    <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z"
            stroke="currentColor"
            strokeWidth={active ? "2" : "1.5"}
            fill={active ? "currentColor" : "none"}
        />
        <path
            d="M14 2V8H20"
            stroke="currentColor"
            strokeWidth={active ? "2" : "1.5"}
            fill="none"
        />
        {/* sparkle */}
        <path
            d="M9 13L10 11L11 13L13 14L11 15L10 17L9 15L7 14L9 13Z"
            fill={active ? "#fff" : "currentColor"}
            stroke="none"
        />
    </svg>
);

export class SummaryModule implements IModule {
    id(): string {
        return "SummaryModule";
    }

    init(): void {
        i18n.registerNamespace("summary", {
            "zh-CN": zhCN,
            "en-US": enUS,
        });

        WKApp.openSummaryDetail = (taskId: number) => {
            WKApp.switchToMenuById?.("summary");
            WKApp.routeLeft.popToRoot();
            WKApp.routeRight.replaceToRoot(
                <SummaryDetailPage taskId={taskId} />
            );
        };

        WKApp.route.register("/summary", () => {
            return <SummaryListPage />;
        });

        WKApp.route.register("/summary/create", () => {
            return <SummaryCreatePage />;
        });

        WKApp.route.register("/summary/detail", (param: any) => {
            return <SummaryDetailPage taskId={param?.taskId} />;
        });

        WKApp.route.register("/summary/confirm", (param: any) => {
            return <SummaryConfirmPage taskId={param?.taskId} />;
        });

        WKApp.route.register("/summary/schedules", () => {
            return <ScheduleListPage />;
        });

        _spaceChangedHandler = () => {
            WKApp.mittBus.emit('summary-space-changed');
        };
        WKApp.mittBus.on('space-changed', _spaceChangedHandler);

        WKApp.searchChatCandidates = async (params) => {
            return getChatCandidates(params);
        };

        // Register NavRail menu item with badge support
        WKApp.menus.register(
            "summary",
            () => {
                const m = new Menus(
                    "summary",
                    "/summary",
                    t("summary.list.title"),
                    <SummaryIcon />,
                    <SummaryIcon active />
                );
                if (_badgeCount > 0) {
                    m.badge = _badgeCount;
                }
                return m;
            },
            2000
        );

        // Listen for badge count updates from SummaryListPage
        WKApp.mittBus.on("summary-badge-update" as any, (payload: { count: number }) => {
            _badgeCount = payload?.count ?? 0;
            WKApp.menus.refresh();
        });
    }
}

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        if (_spaceChangedHandler) {
            WKApp.mittBus.off('space-changed', _spaceChangedHandler);
            _spaceChangedHandler = null;
        }
    });
}
