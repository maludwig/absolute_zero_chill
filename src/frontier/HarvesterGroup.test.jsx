import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { HarvesterGroup } from "./HarvesterGroup.jsx";
import { harvestModel } from "../shared/model.js";

const m = harvestModel(4000);

describe("HarvesterGroup", () => {
  it("idle asteroid shows a free Build button", () => {
    const html = renderToString(
      <HarvesterGroup cat="asteroid" phase="idle" t={0} tau={0} m={m}
        meta={{ label: "Asteroid Fleet" }} cost={0} reserve={0} hasReserve={true}
        onBuild={() => {}} onRecycle={() => {}} />
    );
    expect(html).toContain("Asteroid Fleet");
    expect(html).toContain("Build");
    expect(html).toContain("free");
  });
  it("a non-asteroid with no reserve is locked", () => {
    const html = renderToString(
      <HarvesterGroup cat="dust" phase="idle" t={0} tau={0} m={m}
        meta={{ label: "Dust Collector" }} cost={400} reserve={0} hasReserve={false}
        onBuild={() => {}} onRecycle={() => {}} />
    );
    expect(html).toContain("mine asteroids first");
  });
});
