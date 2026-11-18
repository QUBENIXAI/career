import { redirect } from "next/navigation";

// The careers page lives at /careers so it can drop into the main Qubenix site unchanged.
export default function Home() {
  redirect("/careers");
}
