import { expect, it } from "vitest";
import { getMainNavItems, getNavGroups, mainNavItems } from "./nav-config";

it("names the two library places Inbox and Archive", () => {
  expect(mainNavItems.slice(0, 2).map((item) => item.title)).toEqual([
    "Inbox",
    "Archive",
  ]);
  expect(mainNavItems[0]?.description).toBe("The working pile");
  expect(mainNavItems[1]?.description).toBe(
    "Out of the pile, still in your library",
  );
});

it("keeps the Para nav item when PARA is enabled or unspecified", () => {
  expect(getMainNavItems()).toEqual(mainNavItems);
  expect(
    getMainNavItems({ paraEnabled: true }).map((item) => item.url),
  ).toEqual(["/", "/archived", "/para"]);
});

it("hides the Para nav item when PARA is disabled", () => {
  expect(
    getMainNavItems({ paraEnabled: false }).map((item) => item.url),
  ).toEqual(["/", "/archived"]);
  expect(
    getNavGroups({ paraEnabled: false })[0]?.items.map((item) => item.url),
  ).toEqual(["/", "/archived"]);
});
