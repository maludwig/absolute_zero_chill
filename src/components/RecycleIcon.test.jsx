import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { RecycleIcon } from "./RecycleIcon.jsx";

describe("RecycleIcon", () => {
  it("renders the recycling symbol path with a currentColor fill (so it themes)", () => {
    const html = renderToString(<RecycleIcon size={13} />);
    expect(html).toContain("currentColor");                       // inherits button colour
    expect(html).toContain("69.354446,101.88511");                // the Möbius recycle path
    expect(html).toContain('viewBox="0 0 132.29201 128.23599"');  // source art's viewBox
    expect(html).toContain('width="13"');
  });

  it("is aria-hidden with no title, and a labelled img when given one", () => {
    expect(renderToString(<RecycleIcon />)).toContain('aria-hidden="true"');
    const titled = renderToString(<RecycleIcon title="Recycle" />);
    expect(titled).toContain('role="img"');
    expect(titled).toContain("<title>Recycle</title>");
  });
});
