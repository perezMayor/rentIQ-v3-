import { redirect } from "next/navigation";

export default function RootPage() {
  // Ruta base del grupo (panel): aterriza en dashboard.
  redirect("/dashboard");
}
