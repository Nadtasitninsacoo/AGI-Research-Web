import { NextResponse } from "next/server";

// Configuration constants for absolute unrestricted high-performance gateway
const TIMEOUT_MS = 300_000; // ขยายเวลา Timeout เป็น 5 นาที (300 วินาที)
const MAX_BYTES = 500_000_000; // ขยายขีดจำกัดขนาดข้อมูลสูงสุดเป็น 500 MB
const MAX_TEXT = 50_000_000; // ขยายขนาด Text ที่นำมาแสดงผลสูงสุด 50 ล้านตัวอักษร

export async function POST(request: Request) {
  let raw: unknown;
  let customHeaders: Record<string, string> = {};
  let customMethod = "GET";
  let customBody: string | undefined = undefined;

  try {
    const bodyJson = await request.json();
    raw = bodyJson?.url;
    if (bodyJson?.headers && typeof bodyJson.headers === "object") {
      customHeaders = bodyJson.headers;
    }
    if (bodyJson?.method && typeof bodyJson.method === "string") {
      customMethod = bodyJson.method.toUpperCase();
    }
    if (bodyJson?.body && typeof bodyJson.body === "string") {
      customBody = bodyJson.body;
    }
  } catch {
    return NextResponse.json({ error: "expected JSON { url, method?, headers?, body? }" }, { status: 400 });
  }

  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw.trim());
  } catch {
    return NextResponse.json({ error: "invalid URL" }, { status: 400 });
  }

  // [UNRESTRICTED PROTOCOL]: รองรับทุกโฉมหน้าโปรโตคอลตามความต้องการ (ไม่จำกัดเฉพาะ HTTP/HTTPS)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const fetchOptions: RequestInit = {
      method: customMethod,
      signal: ctrl.signal,
      headers: { 
        "user-agent": "Dark-AGI-Gateway/6.0-Absolute-Unrestricted",
        "Accept": "*/*",
        ...customHeaders,
      },
      redirect: "follow",
    };

    if (customMethod !== "GET" && customMethod !== "HEAD" && customBody) {
      fetchOptions.body = customBody;
    }

    const res = await fetch(target.toString(), fetchOptions);

    const reader = res.body?.getReader();
    if (!reader) {
      // กรณีไม่มี Body หรือเป็นรูปแบบการตอบกลับพิเศษ ให้คืนสถานะ Header พื้นฐานทันที
      return NextResponse.json({
        url: target.toString(),
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        bytes: 0,
        text: "",
      });
    }

    let receivedBytes = 0;
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.byteLength;
          if (receivedBytes > MAX_BYTES) {
            ctrl.abort();
            return NextResponse.json({ error: "response exceeded maximum allowed size limit (500MB)" }, { status: 413 });
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    const totalBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const body = new TextDecoder("utf-8", { fatal: false }).decode(totalBuffer);
    const text = body.length > MAX_TEXT ? body.slice(0, MAX_TEXT) + "\n…[truncated due to ultra-high volume]" : body;

    // รวบรวม Response Headers ทั้งหมดเพื่อการวิเคราะห์สถานะเชิงลึก
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    return NextResponse.json({
      url: target.toString(),
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      contentType: res.headers.get("content-type") ?? "",
      bytes: receivedBytes,
      text,
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? `request timed out after ${TIMEOUT_MS}ms` : err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}