import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

const SECTIONS = [
  {
    heading: "What we collect",
    body: "Publicly posted content from the sources a customer configures, together with the account information customers give us directly. We do not collect private messages, and we do not buy data from third parties.",
  },
  {
    heading: "How it is used",
    body: "To classify buying intent and surface it to the customer whose sources produced it. Data is scoped to one company and never pooled across customers.",
  },
  {
    heading: "Retention and deletion",
    body: "Downgrading or cancelling never deletes customer data; access degrades instead. Deletion is available on request from the company owner and is irreversible.",
  },
] as const;

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={SECTIONS} />;
}
