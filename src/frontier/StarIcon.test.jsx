import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { StarIcon } from "./StarIcon.jsx";

describe("StarIcon", () => {
  it("renders an svg sized to box, one disc per star", () => {
    const html = renderToString(<StarIcon stars={[{ radius: 1, type: "G" }, { radius: 0.2, type: "M" }]} box={30} />);
    expect(html).toContain("<svg");
    expect(html).toContain("staricon");
    expect(html).toContain('width="30"');
    expect((html.match(/<circle/g) || []).length).toBe(2);
  });
});
