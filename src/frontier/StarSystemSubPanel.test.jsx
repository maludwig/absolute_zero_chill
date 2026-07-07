import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { StarSystemSubPanel } from "./StarSystemSubPanel.jsx";

describe("StarSystemSubPanel", () => {
  it("renders all children when expanded", () => {
    const html = renderToString(
      <StarSystemSubPanel name="Sirius" sub="8.60 ly">
        <div>FIRST</div><div>SECOND</div>
      </StarSystemSubPanel>
    );
    expect(html).toContain("Sirius");
    expect(html).toContain("8.60 ly");
    expect(html).toContain("FIRST");
    expect(html).toContain("SECOND");
  });
  it("collapsed shows only the first child", () => {
    const html = renderToString(
      <StarSystemSubPanel name="Sirius" sub="x" collapsed onToggle={() => {}}>
        <div>FIRST</div><div>SECOND</div>
      </StarSystemSubPanel>
    );
    expect(html).toContain("FIRST");
    expect(html).not.toContain("SECOND");
  });
  it("omits the toggle button when onToggle is not provided", () => {
    const html = renderToString(
      <StarSystemSubPanel name="Vega"><div/></StarSystemSubPanel>
    );
    expect(html).not.toContain("sys-toggle");
  });
  it("toggle aria-label reflects collapsed state", () => {
    const collapsed = renderToString(
      <StarSystemSubPanel name="X" collapsed onToggle={() => {}}><div/></StarSystemSubPanel>
    );
    expect(collapsed).toContain("Expand system");
    const expanded = renderToString(
      <StarSystemSubPanel name="X" onToggle={() => {}}><div/></StarSystemSubPanel>
    );
    expect(expanded).toContain("Collapse system");
  });
  it("adds is-collapsed class when collapsed, omits it when not", () => {
    expect(renderToString(
      <StarSystemSubPanel name="X" collapsed onToggle={() => {}}><div/></StarSystemSubPanel>
    )).toContain("is-collapsed");
    expect(renderToString(
      <StarSystemSubPanel name="X"><div/></StarSystemSubPanel>
    )).not.toContain("is-collapsed");
  });
  it("omits the sub span when sub is not provided", () => {
    const html = renderToString(<StarSystemSubPanel name="Vega"><div/></StarSystemSubPanel>);
    expect(html).not.toContain("sys-sub");
  });
});
