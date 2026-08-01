import { MarketingChrome } from "@/components/marketing/marketing-chrome";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingChrome>{children}</MarketingChrome>;
}
