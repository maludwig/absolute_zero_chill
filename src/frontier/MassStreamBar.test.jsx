import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MassStreamBar } from "./MassStreamBar.jsx";

describe("MassStreamBar", () => {
  it("shows a live band when head leads tail", () => {
    expect(renderToString(<MassStreamBar headFrac={0.5} tailFrac={0} />)).toContain("mstream-band");
  });
  it("no band once head and tail meet", () => {
    expect(renderToString(<MassStreamBar headFrac={1} tailFrac={1} />)).not.toContain("mstream-band");
  });
  it("head dot is also absent when band is empty", () => {
    expect(renderToString(<MassStreamBar headFrac={1} tailFrac={1} />)).not.toContain("mstream-head");
  });
  it("clamps out-of-range fracs without producing negative width or position", () => {
    const html = renderToString(<MassStreamBar headFrac={1.5} tailFrac={-0.5} />);
    expect(html).toContain("mstream-band");
    expect(html).not.toContain("width:-");
    expect(html).not.toContain("left:-");
  });
  it("mid-flight snapshot: correct left and width style values", () => {
    // headFrac=0.6, tailFrac=0.1 → left=(1-0.6)*100=40%, width=(0.6-0.1)*100=50%
    const html = renderToString(<MassStreamBar headFrac={0.6} tailFrac={0.1} />);
    expect(html).toContain("left:40%");
    expect(html).toContain("width:50%");
  });

  it("renders multiple bands from a bands array", () => {
    const html = renderToString(
      <MassStreamBar bands={[{ head: 0.9, tail: 0.8 }, { head: 0.4, tail: 0.2 }]} />
    );
    // two bands → two mstream-band divs
    const count = (html.match(/mstream-band/g) || []).length;
    expect(count).toBe(2);
    // exactly one head dot, drawn at the band nearest Sol (largest head)
    expect((html.match(/mstream-head/g) || []).length).toBe(1);
    // head dot near the Sol (left) edge: left ≈ 10%
    const m = html.match(/mstream-head[^>]*left:([\d.]+)%/);
    expect(m).toBeTruthy();
    expect(parseFloat(m[1])).toBeCloseTo(10, 5);
  });

  it("bands array with all-empty bands shows no band or head", () => {
    const html = renderToString(<MassStreamBar bands={[{ head: 1, tail: 1 }]} />);
    expect(html).not.toContain("mstream-band");
    expect(html).not.toContain("mstream-head");
  });
});
