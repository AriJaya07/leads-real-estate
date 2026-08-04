import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of service" };

const SECTIONS = [
  {
    heading: "The service",
    body: "DreamRue is a lead-intelligence tool for real-estate teams operating in Bali. It is not a CRM, and it does not contact anyone on a customer's behalf — outreach is always sent by the customer's own team.",
  },
  {
    heading: "Your data, your control",
    body: "Data collected through a customer's configured sources belongs to that customer. Downgrading or cancelling a subscription pauses collection and locks seats; it never deletes data.",
  },
  {
    heading: "Acceptable use",
    body: "Sources must be ones the customer has a legitimate business reason to monitor. DreamRue reserves the right to suspend an account collecting content outside that scope.",
  },
] as const;

export default function TermsPage() {
  return <LegalPage title="Terms of Service" sections={SECTIONS} />;
}
