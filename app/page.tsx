import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/projects");

  return (
    <main>
      <h1>hyo sync</h1>
      <p>단체 보컬 녹음 음정·박자 체크</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/projects" });
        }}
      >
        <button type="submit">Google 로 로그인</button>
      </form>
    </main>
  );
}
