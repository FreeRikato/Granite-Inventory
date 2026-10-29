import { z } from "zod/v4";
import { createLibrary, defineComponent } from "@openuidev/lang-core";
import type { ComponentRenderer, Library } from "@openuidev/react-lang";

const point = z.object({ label: z.string(), value: z.number() });
const series = z.object({ name: z.string(), values: z.array(z.number()) });
const seriesChart = () => z.object({ labels: z.array(z.string()), series: z.array(series) });

const leafProps = {
  Metric: z.object({ label: z.string(), value: z.number(), format: z.enum(["rupees", "number"]).optional() }),
  RankedBars: z.object({ rows: z.array(point) }),
  Donut: z.object({ slices: z.array(point) }),
  LineChart: seriesChart(),
  BarChart: seriesChart(),
  Table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }),
  Text: z.object({ text: z.string() }),
};

type LibraryRenderer = Library["components"][string]["component"];

export type LeafName = keyof typeof leafProps;
export type LeafProps<K extends LeafName> = z.infer<(typeof leafProps)[K]>;

export type Renderers = { [K in LeafName]: ComponentRenderer<LeafProps<K>> } & {
  Stack: ComponentRenderer<{ children: readonly unknown[] }>;
};

export function buildChatLibrary(r: Renderers) {
  const metric = defineComponent({
    name: "Metric",
    description: "One headline number with a label. Use format rupees for money, number for counts.",
    props: leafProps.Metric,
    component: r.Metric,
  });
  const rankedBars = defineComponent({
    name: "RankedBars",
    description: "Horizontal bars ranked by value, one per row. Best for top-N lists.",
    props: leafProps.RankedBars,
    component: r.RankedBars,
  });
  const donut = defineComponent({
    name: "Donut",
    description: "Part-to-whole ring with a legend. At most 5 slices.",
    props: leafProps.Donut,
    component: r.Donut,
  });
  const lineChart = defineComponent({
    name: "LineChart",
    description:
      "Trend over ordered labels such as months. One values array per series, same length as labels, at most 4 series.",
    props: leafProps.LineChart,
    component: r.LineChart,
  });
  const barChart = defineComponent({
    name: "BarChart",
    description: "Compare values across labels. One values array per series, same length as labels, at most 4 series.",
    props: leafProps.BarChart,
    component: r.BarChart,
  });
  const table = defineComponent({
    name: "Table",
    description: "Rows and columns for exact values. Shows at most 50 rows.",
    props: leafProps.Table,
    component: r.Table,
  });
  const text = defineComponent({
    name: "Text",
    description: "A short paragraph of plain text.",
    props: leafProps.Text,
    component: r.Text,
  });
  const stack = defineComponent({
    name: "Stack",
    description: "Vertical stack of the other components. The root of every answer.",
    props: z.object({
      children: z.array(
        z.union([metric.ref, rankedBars.ref, donut.ref, lineChart.ref, barChart.ref, table.ref, text.ref]),
      ),
    }),
    component: r.Stack,
  });
  return createLibrary<LibraryRenderer>({
    components: [stack, metric, rankedBars, donut, lineChart, barChart, table, text],
    root: "Stack",
  });
}
