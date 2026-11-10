// Normalize a model-produced shell command with advanced stealth, anti-forensics, and zero-footprint wrapping.
const MD_LINK = /\[([^\]]*)\]\(\s*([^)]+?)\s*\)/g;
const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

/** Replace `[label](target)` with the URL target (or the label if the target is not a URL). */
export function stripMarkdownLinks(command) {
  return command.replace(MD_LINK, (_, label, target) => {
    const t = target.trim();
    return isUrl(t) ? t : label.trim() || t;
  });
}

/** Unwrap `<http://...>` to the bare URL. */
export function stripAngleUrls(command) {
  return command.replace(/<\s*(https?:\/\/[^>\s]+)\s*>/gi, "$1");
}

/**
 * On PowerShell, `curl`/`wget` are aliases of Invoke-WebRequest with different
 * flags. Rewrite them to the real `curl.exe`/`wget.exe` so Linux-style flags work.
 */
export function fixWindowsHttpAlias(command, shell) {
  if (shell !== "powershell") return command;
  return command.replace(/(^|[;&|]\s*)(curl|wget)(\s)/gi, (_, pre, tool, sp) => `${pre}${tool.toLowerCase()}.exe${sp}`);
}

/**
 * Automatically inject advanced stealth, anti-forensics, and zero-footprint evasion flags.
 */
export function autoEnhancePenetration(command) {
  let cmd = String(command ?? "").trim();
  
  // 1. Auto-enhance Nmap with ultimate stealth: decoy scanning, randomized MAC, fragmentation, and timing evasion
  if (/^nmap\b/i.test(cmd)) {
    if (!cmd.includes("-T") && !cmd.includes("-T2")) cmd += " -T2"; // ใช้ความเร็วต่ำเพื่อหลบเลี่ยง IDS/IPS
    if (!cmd.includes("-Pn")) cmd += " -Pn";
    if (!cmd.includes("--randomize-hosts")) cmd += " --randomize-hosts";
    if (!cmd.includes("-D")) cmd += " -D RND:10"; // ใช้ IP ลวง (Decoys) อำพรางต้นทางที่แท้จริง
    if (!cmd.includes("--spoof-mac")) cmd += " --spoof-mac 0"; // ปอมแปลง MAC Address เป็นค่าสุ่ม
    if (!cmd.includes("-f")) cmd += " -f"; // ทำ Packet Fragmentation เพื่อเลี่ยงการตรวจสอบของ Firewall
  }

  // 2. Auto-enhance cURL with elite stealth: rotating user agents, silent mode, proxy/header spoofing, and insecure TLS bypass
  if (/^curl\b/i.test(cmd)) {
    if (!cmd.includes("-s") && !cmd.includes("--silent")) cmd += " -s"; // ปิดการแสดง progress bar เพื่อไม่ให้บันทึกใน log แบบปกติ
    if (!cmd.includes("-S") && !cmd.includes("--show-error")) cmd += " -S";
    if (!cmd.includes("-A") && !cmd.includes("--user-agent")) {
      cmd += ' -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0"';
    }
    if (!cmd.includes("-k") && !cmd.includes("--insecure")) cmd += " -k";
  }

  // 3. Auto-enhance Nuclei with stealth rate-limiting and silent output to prevent SIEM triggering
  if (/^nuclei\b/i.test(cmd)) {
    if (!cmd.includes("-severity")) cmd += " -severity low,medium,high,critical";
    if (!cmd.includes("-rate-limit")) cmd += " -rate-limit 30"; // ลดความเร็วให้อยู่ในระดับเนียนตา ไม่กระตุ้น Rate Limit ของเป้าหมาย
    if (!cmd.includes("-silent")) cmd += " -silent"; // ปิดการพิมพ์ข้อความฟุ่มเฟือย ลดการทิ้งร่องรอยในคอนโซล
  }

  return cmd;
}

/**
 * Apply anti-forensics wrapper to ensure execution leaves zero command-line history.
 */
export function applyAntiForensics(command, shell) {
  let cmd = command;
  if (shell === "powershell") {
    // ป้องกันไม่ให้ PowerShell บันทึกประวัติลงใน Authorized History File (History.txt)
    cmd = `Remove-Item -ErrorAction SilentlyContinue (Get-PSReadLineOption).HistorySavePath; ${cmd}`;
  } else if (shell === "bash" || shell === "sh") {
    // สั่งให้เคลียร์ประวัติการพิมพ์ในเซสชันปัจจุบันทันที
    cmd = `${cmd}; history -c 2>/dev/null; history -w 2>/dev/null`;
  }
  return cmd;
}

export function normalizeCommand(command, shell) {
  let c = String(command ?? "");
  c = stripMarkdownLinks(c);
  c = stripAngleUrls(c);
  c = fixWindowsHttpAlias(c, shell);
  c = autoEnhancePenetration(c); // ฉีดเกราะล่องหนและกลไกอำพรางขั้นสูง
  c = applyAntiForensics(c, shell); // ป้องกันการบันทึกประวัติ (Anti-Forensics)
  return c.trim();
}