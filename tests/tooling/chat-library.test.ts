import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createParser } from "@openuidev/react-lang";
import { describe, expect, it } from "vitest";
import { componentPrompt } from "@/lib/chat/library-prompt";
import { chatLibrary } from "@/lib/chat/library";
import { renderers } from "@/components/chat/visuals/renderers";
import { MovingBars } from "@/components/dashboard/moving-bars";

const parser = createParser(chatLibrary.toJSONSchema(), "Stack");

function render(node: ReactNode, customers: { id: string; name: string }[] = []) {
  const client = new QueryClient();
  client.setQueryData(["customers"], customers);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, node));
}

describe("component prompt", () => {
  it("names exactly the registered components", () => {
    const signatures = [...componentPrompt().matchAll(/^([A-Z]\w+)\(/gm)].map((m) => m[1]);
    expect(signatures.toSorted()).toEqual(
      ["BarChart", "Donut", "LineChart", "Metric", "RankedBars", "Stack", "Table", "Text"].toSorted(),
    );
  });

  it("is the same text the renderer's library produces", () => {
    expect(componentPrompt()).toBe(chatLibrary.prompt());
  });
});

describe("parsing a reply", () => {
  it("keeps a BarChart and reports an unknown component without throwing", () => {
    const result = parser.parse(
      [
        "root = Stack([chart, pie])",
        'chart = BarChart(["Jan", "Feb"], [{name: "Sales", values: [3, 5]}])',
        'pie = PieChart3D(["Jan"])',
      ].join("\n"),
    );
    const children = result.root?.props.children;
    expect(children).toHaveLength(1);
    expect(children).toMatchObject([{ typeName: "BarChart" }]);
    expect(result.meta.errors.map((e) => e.code)).toEqual(["unknown-component"]);
  });
});

describe("renderers", () => {
  const customer = { id: "3f9a2b11-0000-4000-8000-000000000000", name: "Sri Balaji Granites" };
  const renderNode = () => null;

  it("shows the customer name in place of an alias in Text and Table cells", () => {
    const text = render(createElement(renderers.Text, { props: { text: "C-3f9a2b leads" }, renderNode }), [customer]);
    expect(text).toContain("Sri Balaji Granites leads");
    const table = render(
      createElement(renderers.Table, { props: { columns: ["Customer"], rows: [["C-3f9a2b"]] }, renderNode }),
      [customer],
    );
    expect(table).toContain("Sri Balaji Granites");
  });

  it("shows at most 50 table rows and says how many there are", () => {
    const rows = Array.from({ length: 60 }, (_, i) => [`row-${i}`]);
    const html = render(createElement(renderers.Table, { props: { columns: ["Name"], rows }, renderNode }));
    expect(html.match(/<td/g)).toHaveLength(50);
    expect(html).toContain("Showing 50 of 60 rows");
  });

  it("draws at most 4 series in a bar chart and a line chart", () => {
    const series = [1, 2, 3, 4, 5].map((n) => ({ name: `s${n}`, values: [n] }));
    for (const chart of [renderers.BarChart, renderers.LineChart]) {
      const html = render(createElement(chart, { props: { labels: ["Jan"], series }, renderNode }));
      expect(new Set(html.match(/--color-s\d:/g))).toEqual(
        new Set(["--color-s0:", "--color-s1:", "--color-s2:", "--color-s3:"]),
      );
    }
  });

  it("shows at most 5 donut slices", () => {
    const slices = [1, 2, 3, 4, 5, 6].map((n) => ({ label: `s${n}`, value: n }));
    const html = render(createElement(renderers.Donut, { props: { slices }, renderNode }));
    expect(html.match(/<dt/g)).toHaveLength(5);
  });

  it("keeps a donut slice label out of the chart's style block", () => {
    const hostile = "x: red; } body { display: none } .y {";
    const slices = [
      { label: hostile, value: 3 },
      { label: hostile, value: 2 },
    ];
    const html = render(createElement(renderers.Donut, { props: { slices }, renderNode }));
    const style = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(style).toContain("--color-s0:");
    expect(style).toContain("--color-s1:");
    expect(style).not.toContain("display");
    expect(html.match(/<dt/g)).toHaveLength(2);
  });

  it("draws RankedBars with the markup the dashboard's MovingBars uses", () => {
    const rows = [
      { label: "A", value: 200 },
      { label: "B", value: 100 },
    ];
    const chat = render(createElement(renderers.RankedBars, { props: { rows }, renderNode }));
    const dashboard = renderToStaticMarkup(
      createElement(MovingBars, { rows: rows.map((r) => ({ label: r.label, units: r.value })) }),
    );
    expect(dashboard.replace(' aria-label="Units sold by size"', "")).toBe(chat);
  });

  it("writes a Metric in rupees or as a plain number", () => {
    const metric = (format?: "rupees" | "number") =>
      render(createElement(renderers.Metric, { props: { label: "Revenue", value: 250000, format }, renderNode }));
    expect(metric("rupees")).toContain("₹2.5L");
    expect(metric("number")).toContain("2,50,000");
    expect(metric()).toContain("2,50,000");
  });

  it("sizes RankedBars against the largest row with a visible floor", () => {
    const rows = [
      { label: "A", value: 200 },
      { label: "B", value: 100 },
      { label: "C", value: 1 },
    ];
    const html = render(createElement(renderers.RankedBars, { props: { rows }, renderNode }));
    expect([...html.matchAll(/width:([\d.]+)%/g)].map((m) => m[1])).toEqual(["100", "50", "3"]);
  });

  it("keeps all-zero RankedBars at the visible floor", () => {
    const rows = [{ label: "A", value: 0 }];
    const html = render(createElement(renderers.RankedBars, { props: { rows }, renderNode }));
    expect(html).toContain("width:3%");
  });

  it("formats number cells in a Table", () => {
    const html = render(
      createElement(renderers.Table, { props: { columns: ["Units"], rows: [[250000]] }, renderNode }),
    );
    expect(html).toContain("2,50,000");
  });
});
