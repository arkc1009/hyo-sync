import AppShell from "@/components/AppShell";

export default function Layout({ children }: LayoutProps<"/projects">) {
  return <AppShell>{children}</AppShell>;
}
