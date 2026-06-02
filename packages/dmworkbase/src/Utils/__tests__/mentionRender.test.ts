import { describe, expect, it } from "vitest";
import {
  buildMentionDropdownItems,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
} from "../mentionRender";

const members = [
  { uid: "u1", name: "Alice" },
  { uid: "bot1", name: "BuildBot", orgData: { robot: 1 } },
];

const baseArgs = {
  members,
  iconResolver: () => "",
  externalResolver: () => ({ isExternal: false, sourceSpaceName: "" }),
  stickyIcon: "",
};

describe("buildMentionDropdownItems", () => {
  it("prepends broadcast mentions for an empty group query", () => {
    const items = buildMentionDropdownItems({
      ...baseArgs,
      query: "",
    });

    expect(items.map((item) => item.uid)).toEqual([
      MENTION_UID_HUMANS,
      MENTION_UID_AIS,
      "u1",
      "bot1",
    ]);
  });

  it("omits broadcast mentions when disabled for direct chats", () => {
    const items = buildMentionDropdownItems({
      ...baseArgs,
      query: "",
      includeBroadcastMentions: false,
    });

    expect(items.map((item) => item.uid)).toEqual(["u1", "bot1"]);
  });

  it("keeps broadcast mentions hidden while filtering members", () => {
    const items = buildMentionDropdownItems({
      ...baseArgs,
      query: "Ali",
    });

    expect(items.map((item) => item.uid)).toEqual(["u1"]);
  });
});
