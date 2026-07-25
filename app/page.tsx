import { redirect } from "next/navigation";

/** The inbox is the product; there is no separate landing page. */
export default function RootPage() {
  redirect("/leads");
}
