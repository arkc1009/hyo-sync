// Vercel Blob 업로드 400 재현 스크립트 (브라우저 없이 Node 에서 실행)
//
// 브라우저는 CORS 헤더 없는 400 응답의 본문을 읽지 못하지만 Node 는 읽을 수 있다.
// 앱과 같은 옵션으로 클라이언트 토큰을 만들어 크기·Content-Type 별로 단일 PUT / 멀티파트 생성을 시도하고
// 상태 코드, CORS 헤더, 응답 본문을 그대로 출력한다. 올라간 파일은 끝에 지운다.
//
// 사용법:
//   BLOB_READ_WRITE_TOKEN=... node scripts/blob-repro.mjs                 # 합성 wav 5/20/25/30MB
//   BLOB_READ_WRITE_TOKEN=... node scripts/blob-repro.mjs 10 29           # 크기(MB) 지정
//   BLOB_READ_WRITE_TOKEN=... node scripts/blob-repro.mjs ./guide.wav     # 실제 파일
//
// 토큰은 셸 환경변수로만 넘기고 출력·커밋하지 않는다. 채팅 등에 붙여 넣었다면 Vercel 대시보드에서 재발급할 것.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { del } from "@vercel/blob";

const API = "https://vercel.com/api/blob";
const API_VERSION = "13"; // @vercel/blob 2.8.2 의 BLOB_API_VERSION
const ORIGIN = process.env.REPRO_ORIGIN ?? "https://hyo-sync.vercel.app";
// 스토어가 private 이라 앱과 같은 private 이 기본. REPRO_ACCESS=public 으로 비교 가능
const ACCESS = process.env.REPRO_ACCESS ?? "private";

const rwToken = process.env.BLOB_READ_WRITE_TOKEN;
if (!rwToken) {
  console.error("BLOB_READ_WRITE_TOKEN 환경변수가 필요합니다");
  process.exit(1);
}

const cases = await loadCases(process.argv.slice(2));
const uploaded = [];

for (const c of cases) {
  for (const contentType of [c.contentType, "audio/mpeg"]) {
    console.log(`\n=== ${c.label} (${mb(c.body.byteLength)}MB) access=${ACCESS} contentType=${contentType} ===`);
    await tryPut(c, contentType);
  }
  await tryMpuCreate(c, c.contentType);
}

if (uploaded.length) {
  await del(uploaded, { token: rwToken });
  console.log(`\n정리: 올라간 ${uploaded.length}개 삭제`);
}

async function clientToken(pathname) {
  // app/api/blob/upload/route.ts 의 onBeforeGenerateToken 과 같은 옵션
  return generateClientTokenFromReadWriteToken({
    token: rwToken,
    pathname,
    allowedContentTypes: ["audio/*", "video/mp4", "application/octet-stream"],
    maximumSizeInBytes: 200 * 1024 * 1024,
    addRandomSuffix: true,
    validUntil: Date.now() + 60 * 60 * 1000,
  });
}

function headers(token, contentType, extra = {}) {
  return {
    authorization: `Bearer ${token}`,
    origin: ORIGIN,
    "x-api-version": API_VERSION,
    "x-vercel-blob-store-id": token.split("_")[3] ?? "",
    "x-vercel-blob-access": ACCESS,
    "x-add-random-suffix": "1",
    "x-content-type": contentType,
    ...extra,
  };
}

async function tryPut(c, contentType) {
  const pathname = `repro/${Date.now()}-${c.label}.${c.ext}`;
  const token = await clientToken(pathname);
  const t0 = Date.now();
  const res = await fetch(`${API}/?${new URLSearchParams({ pathname })}`, {
    method: "PUT",
    headers: headers(token, contentType, { "x-content-length": String(c.body.byteLength) }),
    body: c.body,
  });
  const text = await report("PUT", res, t0);
  if (res.ok) uploaded.push(JSON.parse(text).url);
}

async function tryMpuCreate(c, contentType) {
  console.log(`\n=== ${c.label} 멀티파트 생성(mpu create) contentType=${contentType} ===`);
  const pathname = `repro/${Date.now()}-${c.label}-mpu.${c.ext}`;
  const token = await clientToken(pathname);
  const t0 = Date.now();
  const res = await fetch(`${API}/mpu?${new URLSearchParams({ pathname })}`, {
    method: "POST",
    headers: headers(token, contentType, { "x-mpu-action": "create" }),
  });
  await report("MPU create", res, t0);
}

async function report(label, res, t0) {
  const text = await res.text();
  console.log(`${label}: ${res.status} ${res.statusText} (${Date.now() - t0}ms)`);
  console.log(`  access-control-allow-origin: ${res.headers.get("access-control-allow-origin") ?? "(없음)"}`);
  console.log(`  content-type: ${res.headers.get("content-type")}, 본문 ${text.length}바이트`);
  console.log(`  본문: ${text.slice(0, 500)}`);
  return text;
}

async function loadCases(args) {
  if (args.length && !/^\d+(\.\d+)?$/.test(args[0])) {
    const body = await readFile(args[0]);
    const ext = (/\.([a-z0-9]{1,5})$/i.exec(args[0])?.[1] ?? "bin").toLowerCase();
    return [{ label: basename(args[0]).replace(/[^\w.-]/g, "_"), ext, contentType: ext === "wav" ? "audio/wav" : "audio/mpeg", body }];
  }
  const sizes = args.length ? args.map(Number) : [5, 20, 25, 30];
  return sizes.map((n) => ({ label: `synth-${n}mb`, ext: "wav", contentType: "audio/wav", body: synthWav(n * 1024 * 1024) }));
}

/** 크기를 맞춘 44.1kHz 16bit 모노 사인파 wav */
function synthWav(bytes) {
  const dataLen = bytes - 44;
  const buf = Buffer.alloc(bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(bytes - 8, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(44100, 24);
  buf.writeUInt32LE(44100 * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i + 1 < dataLen; i += 2) buf.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 2 / 44100)), 44 + i);
  return buf;
}

function mb(n) {
  return (n / 1024 / 1024).toFixed(1);
}
