import Link from "next/link";
import { FeedbackLoop, HeroWaves, MixerLoop, PitchLoop } from "@/components/landing/Motion";
import Reveal from "@/components/landing/Reveal";
import s from "@/components/landing/landing.module.css";
import { auth, signIn } from "@/lib/auth";

const MARQUEE = ["음정 체크", "박자 체크", "소절별 판정", "웹 믹서", "구간 피드백", "초대 링크", "파트 관리", "재녹음 요청"];

const FEATURES = [
  {
    tag: "01 · 체크",
    title: "가이드와 겹쳐 보는 음정·박자",
    body: "녹음본을 올리면 브라우저에서 피치를 뽑아 가이드 보컬과 소절별로 비교해요. 결과는 OK · 보정 가능 · 재녹음 세 가지로.",
    demo: <PitchLoop />,
  },
  {
    tag: "02 · 믹스",
    title: "DAW 없이 바로 듣는 웹 믹서",
    body: "반주와 멤버 트랙을 한 화면에서 동시에 재생해요. 볼륨 · 뮤트 · 솔로로 전체 합을 바로 확인.",
    demo: <MixerLoop />,
  },
  {
    tag: "03 · 피드백",
    title: "구간에 꽂는 코멘트",
    body: "담당자는 문제 구간을 드래그해 코멘트를 남기고, 멤버는 제출 페이지에서 그 구간을 바로 다시 들어요.",
    demo: <FeedbackLoop />,
  },
];

const STEPS = [
  { n: "01", title: "곡을 만들고 초대해요", body: "곡 제목을 정하고 파트별 가이드를 올린 뒤 초대 링크를 공유해요." },
  { n: "02", title: "멤버가 녹음을 올려요", body: "멤버는 링크로 들어와 파트를 고르고 녹음본을 올리기만 하면 돼요." },
  { n: "03", title: "리포트 · 믹스 · 피드백", body: "판정 리포트를 보고, 웹 믹서로 합을 듣고, 구간 코멘트로 재녹음을 요청해요." },
];

export default async function Home() {
  const session = await auth();
  const loggedIn = Boolean(session?.user?.id);

  const cta = (label: string, big = false) =>
    loggedIn ? (
      <Link href="/projects" className={`${s.btn} ${big ? s.btnBig : ""}`}>
        내 프로젝트로 <span aria-hidden="true">→</span>
      </Link>
    ) : (
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/projects" });
        }}
      >
        <button type="submit" className={`${s.btn} ${big ? s.btnBig : ""}`}>
          {label} <span aria-hidden="true">→</span>
        </button>
      </form>
    );

  return (
    <div className={s.root}>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        precedence="default"
      />
      <header className={s.nav}>
        <Link href="/" className={s.logo}>
          <span className={s.logoMark} aria-hidden="true">
            <i /><i /><i />
          </span>
          hyo sync
        </Link>
        <nav className={s.navLinks}>
          <a href="#features">기능</a>
          <a href="#how">사용법</a>
          {cta("시작하기")}
        </nav>
      </header>

      <main>
        <section className={s.hero}>
          <div className={s.glow} aria-hidden="true" />
          <Reveal>
            <p className={s.eyebrow}>함께 부르는 노래를 위한 작업실</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className={s.heroTitle}>
              흩어진 목소리를,
              <br />
              <span className={s.heroAccent}>한 곡으로.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className={s.heroSub}>
              멤버 녹음 체크부터 믹스 확인, 구간 피드백까지.
              <br />
              파일 수십 개를 혼자 듣던 수고는 hyo sync 에 맡기세요.
            </p>
          </Reveal>
          <Reveal delay={240} className={s.heroCta}>
            {cta("Google 로 시작하기", true)}
            <a href="#features" className={s.ghost}>
              둘러보기
            </a>
          </Reveal>
          <Reveal delay={320} className={s.heroStage}>
            <HeroWaves />
          </Reveal>
        </section>

        <div className={s.marquee} aria-hidden="true">
          <div className={s.marqueeInner}>
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i}>
                {m}
                <i>✦</i>
              </span>
            ))}
          </div>
        </div>

        <section className={s.problem}>
          <Reveal>
            <p className={s.eyebrow}>왜 만들었나요</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className={s.problemTitle}>
              담당자 혼자 이어폰 끼고
              <br />
              <span className={s.dim}>밤새 파일을 넘기던 일,</span>
              <br />
              이제 그만해도 돼요.
            </h2>
          </Reveal>
          <div className={s.stats}>
            {[
              { k: "소절 단위", v: "판정" },
              { k: "브라우저에서", v: "분석" },
              { k: "링크 하나로", v: "참여" },
            ].map((st, i) => (
              <Reveal key={st.k} delay={i * 100} className={s.stat}>
                <span className={s.statK}>{st.k}</span>
                <span className={s.statV}>{st.v}</span>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="features" className={s.features}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.tag} className={`${s.feature} ${i % 2 ? s.featureFlip : ""}`}>
              <div className={s.featureText}>
                <span className={s.tag}>{f.tag}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
              <div className={s.card}>{f.demo}</div>
            </Reveal>
          ))}
        </section>

        <section id="how" className={s.how}>
          <Reveal>
            <p className={s.eyebrow}>사용법</p>
            <h2 className={s.sectionTitle}>세 단계면 충분해요</h2>
          </Reveal>
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.n}>
                <Reveal delay={i * 120} className={s.step}>
                  <span className={s.stepN}>{st.n}</span>
                  <h3>{st.title}</h3>
                  <p>{st.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.final}>
          <Reveal>
            <h2 className={s.finalTitle}>
              다음 합창은
              <br />
              <span className={s.heroAccent}>더 가볍게.</span>
            </h2>
          </Reveal>
          <Reveal delay={120} className={s.heroCta}>
            {cta("Google 로 시작하기", true)}
          </Reveal>
        </section>
      </main>

      <footer className={s.footer}>
        <span>© {new Date().getFullYear()} hyo sync</span>
        <span>단체 보컬 녹음 작업실</span>
      </footer>
    </div>
  );
}
