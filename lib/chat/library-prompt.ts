import { buildChatLibrary, type Renderers } from "@/components/chat/visuals/define";

const none = () => null;

const promptOnly: Renderers = {
  Stack: none,
  Metric: none,
  RankedBars: none,
  Donut: none,
  LineChart: none,
  BarChart: none,
  Table: none,
  Text: none,
};

const promptLibrary = buildChatLibrary(promptOnly);

export function componentPrompt(): string {
  return promptLibrary.prompt();
}
