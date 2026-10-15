import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** 서버 컴포넌트·서버 액션용. 로그인 안 돼 있으면 홈으로 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user;
}

/** 라우트 핸들러용. 로그인 안 돼 있으면 null */
export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}
