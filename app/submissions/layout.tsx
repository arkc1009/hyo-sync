import AppShell from "@/components/AppShell";

export default function Layout({ children }: LayoutProps<"/submissions">) {
  return <AppShell>{children}</AppShell>;
}
