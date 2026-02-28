import { redirect } from "next/navigation";

export default function HomePage() {
  // Entrada principal: redirección directa al panel.
  redirect("/dashboard");
}
