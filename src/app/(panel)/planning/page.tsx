import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ start?: string; period?: string; plate?: string; group?: string; model?: string; selected?: string; error?: string }>;
};

export default async function PlanningPage({ searchParams }: Props) {
  const params = await searchParams;
  const start = params.start ?? new Date().toISOString().slice(0, 10);
  const period = params.period ?? "30";
  const plate = params.plate ?? "";
  const group = params.group ?? "";
  const model = params.model ?? "";
  const selected = params.selected ?? "";
  const error = params.error ?? "";

  const query = new URLSearchParams({
    start,
    period,
    plate,
    group,
    model,
  });
  if (selected) query.set("selected", selected);
  if (error) query.set("error", error);
  redirect(`/planning-completo?${query.toString()}`);
}
