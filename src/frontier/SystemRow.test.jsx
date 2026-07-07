import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { SystemRow } from "./SystemRow.jsx";

describe("SystemRow", () => {
  it("lays out sol / bar / dest / right slots", () => {
    const html = renderToString(
      <SystemRow solIcon={<i>S</i>} destIcon={<i>D</i>} right="4.37 ly"><span>BAR</span></SystemRow>
    );
    expect(html).toContain("sysrow-sol");
    expect(html).toContain("sysrow-bar");
    expect(html).toContain("sysrow-dest");
    expect(html).toContain("4.37 ly");
    expect(html).toContain("BAR");
  });
  it("preserves slot wrapper divs when solIcon and destIcon are null", () => {
    const html = renderToString(<SystemRow><span>B</span></SystemRow>);
    expect(html).toContain("sysrow-sol");
    expect(html).toContain("sysrow-dest");
  });
  it("appends a custom className to the sysrow root", () => {
    const html = renderToString(<SystemRow className="my-row"><span/></SystemRow>);
    expect(html).toContain("sysrow my-row");
  });
  it("renders nothing in the right slot when right is omitted", () => {
    const html = renderToString(<SystemRow><span/></SystemRow>);
    // the wrapper div is still present but empty
    expect(html).toContain("sysrow-right");
    expect(html).not.toContain("ly");
  });
});
