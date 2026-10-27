"""Dependency-free defensive web check (Python stdlib only).

Checks HTTP security headers and TLS certificate expiry for an AUTHORIZED
target. Read-only: it does not exploit, brute force, or perform DoS.

Usage:  python -I web_check.py <https-or-http-url>
Output: a single JSON object on stdout.

Run with -I (isolated mode) so a planted module in the working directory
cannot hijack imports.
"""
import json
import ssl
import socket
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def scan_vulnerabilities(target: str, timeout: int = 5) -> dict:
    parsed = urlparse(target)

    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Target must be a valid HTTP or HTTPS URL")

    if parsed.username or parsed.password:
        raise ValueError("URLs with credentials are not allowed")

    findings = []

    def add_finding(title, severity, evidence, remediation):
        findings.append({
            "title": title,
            "severity": severity,
            "evidence": evidence,
            "remediation": remediation,
        })

    # 1. HTTP response and security headers
    try:
        request = Request(
            target,
            headers={"User-Agent": "AGI-Research-Defensive-Scanner/1.0"},
            method="GET",
        )

        try:
            response = urlopen(request, timeout=timeout)
        except HTTPError as error:
            response = error

        with response:
            status = response.status
            headers = response.headers

            if parsed.scheme == "https":
                required_headers = {
                    "Strict-Transport-Security": (
                        "medium",
                        "Set HSTS after confirming HTTPS works correctly",
                    ),
                    "Content-Security-Policy": (
                        "medium",
                        "Define a CSP suited to the resources the site uses",
                    ),
                    "X-Content-Type-Options": (
                        "low",
                        "Set X-Content-Type-Options: nosniff",
                    ),
                    "Referrer-Policy": (
                        "low",
                        "Set a Referrer-Policy that limits URL exposure",
                    ),
                }

                for header, (severity, remediation) in required_headers.items():
                    if not headers.get(header):
                        add_finding(
                            f"Missing security header: {header}",
                            severity,
                            f"HTTP status={status}; header {header} not present",
                            remediation,
                        )

            if parsed.scheme == "http":
                add_finding(
                    "Site served over HTTP",
                    "medium",
                    "URL uses HTTP, which is not TLS-encrypted",
                    "Enable HTTPS and redirect HTTP to HTTPS",
                )

    except (URLError, TimeoutError, OSError, ValueError) as error:
        add_finding(
            "Could not check HTTP endpoint",
            "info",
            str(error)[:500],
            "Check DNS, firewall, and the web server status",
        )

    # 2. TLS certificate (HTTPS only)
    if parsed.scheme == "https":
        hostname = parsed.hostname
        port = parsed.port or 443

        try:
            context = ssl.create_default_context()

            with socket.create_connection((hostname, port), timeout=timeout) as raw_socket:
                with context.wrap_socket(raw_socket, server_hostname=hostname) as tls_socket:
                    certificate = tls_socket.getpeercert()
                    expiry_text = certificate.get("notAfter")

                    if expiry_text:
                        expiry = datetime.strptime(
                            expiry_text, "%b %d %H:%M:%S %Y %Z"
                        ).replace(tzinfo=timezone.utc)

                        remaining_days = (expiry - datetime.now(timezone.utc)).days

                        if remaining_days < 0:
                            add_finding(
                                "TLS certificate expired",
                                "high",
                                f"Expired on {expiry.isoformat()}",
                                "Renew the certificate and verify the chain of trust",
                            )
                        elif remaining_days <= 14:
                            add_finding(
                                "TLS certificate expiring soon",
                                "medium",
                                f"About {remaining_days} days left",
                                "Renew the certificate before it expires",
                            )

                    cipher = tls_socket.cipher()

                    return {
                        "target": target,
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                        "tls": {
                            "version": tls_socket.version(),
                            "cipher": cipher[0] if cipher else None,
                        },
                        "findings": findings,
                        "finding_count": len(findings),
                    }

        except (OSError, ssl.SSLError, ValueError) as error:
            add_finding(
                "TLS check failed",
                "info",
                str(error)[:500],
                "Check the certificate, TLS configuration, and connectivity",
            )

    return {
        "target": target,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "tls": None,
        "findings": findings,
        "finding_count": len(findings),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: web_check.py <url>"}, ensure_ascii=False))
        sys.exit(2)
    try:
        report = scan_vulnerabilities(sys.argv[1])
    except Exception as error:  # noqa: BLE001 - report any error as JSON
        print(json.dumps({"error": str(error)[:500]}, ensure_ascii=False))
        sys.exit(1)
    print(json.dumps(report, indent=2, ensure_ascii=False))
