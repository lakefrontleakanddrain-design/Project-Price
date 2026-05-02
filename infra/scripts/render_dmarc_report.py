import argparse
import csv
import gzip
import html
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree
from zipfile import ZipFile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render DMARC aggregate XML reports into a readable HTML dashboard and CSV exports."
    )
    parser.add_argument(
        "input_path",
        help="Path to a DMARC XML file, a .gz/.zip attachment, or a directory containing reports.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory for generated HTML/CSV files. Defaults to <input>/dmarc-output or <input parent>/dmarc-output.",
    )
    return parser.parse_args()


def discover_xml_payloads(input_path: Path) -> list[tuple[str, bytes]]:
    payloads: list[tuple[str, bytes]] = []
    if input_path.is_dir():
        for candidate in sorted(input_path.rglob("*")):
            if candidate.is_file() and candidate.suffix.lower() in {".xml", ".gz", ".zip"}:
                payloads.extend(read_payload(candidate))
        return payloads

    return read_payload(input_path)


def read_payload(file_path: Path) -> list[tuple[str, bytes]]:
    suffix = file_path.suffix.lower()
    if suffix == ".xml":
        return [(file_path.name, file_path.read_bytes())]
    if suffix == ".gz":
        with gzip.open(file_path, "rb") as handle:
            return [(file_path.stem, handle.read())]
    if suffix == ".zip":
        payloads: list[tuple[str, bytes]] = []
        with ZipFile(file_path) as archive:
            for member in archive.namelist():
                if member.lower().endswith(".xml"):
                    payloads.append((f"{file_path.name}:{member}", archive.read(member)))
        return payloads
    return []


def text(node: ElementTree.Element | None, path: str, default: str = "") -> str:
    if node is None:
        return default
    found = node.find(path)
    if found is None or found.text is None:
        return default
    return found.text.strip()


def to_datetime(value: str) -> str:
    if not value:
        return ""
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return value


def parse_report(label: str, payload: bytes) -> tuple[list[dict[str, str]], dict[str, str]]:
    root = ElementTree.fromstring(payload)
    metadata = root.find("report_metadata")
    policy = root.find("policy_published")

    report_summary = {
        "source_file": label,
        "org_name": text(metadata, "org_name"),
        "report_id": text(metadata, "report_id"),
        "date_begin": to_datetime(text(metadata, "date_range/begin")),
        "date_end": to_datetime(text(metadata, "date_range/end")),
        "domain": text(policy, "domain"),
        "adkim": text(policy, "adkim"),
        "aspf": text(policy, "aspf"),
        "p": text(policy, "p"),
        "sp": text(policy, "sp"),
        "pct": text(policy, "pct"),
    }

    records: list[dict[str, str]] = []
    for record in root.findall("record"):
        row = record.find("row")
        identifiers = record.find("identifiers")
        auth_results = record.find("auth_results")

        dkim_results = "; ".join(format_dkim_result(node) for node in auth_results.findall("dkim")) if auth_results is not None else ""
        spf_results = "; ".join(format_spf_result(node) for node in auth_results.findall("spf")) if auth_results is not None else ""

        records.append(
            {
                **report_summary,
                "source_ip": text(row, "source_ip"),
                "count": text(row, "count", "0"),
                "disposition": text(row, "policy_evaluated/disposition"),
                "dkim_aligned": text(row, "policy_evaluated/dkim"),
                "spf_aligned": text(row, "policy_evaluated/spf"),
                "header_from": text(identifiers, "header_from"),
                "envelope_to": text(identifiers, "envelope_to"),
                "envelope_from": text(identifiers, "envelope_from"),
                "auth_dkim": dkim_results,
                "auth_spf": spf_results,
            }
        )

    return records, report_summary


def format_dkim_result(node: ElementTree.Element) -> str:
    domain = text(node, "domain")
    selector = text(node, "selector")
    result = text(node, "result")
    selector_part = f"/{selector}" if selector else ""
    return f"{domain}{selector_part}: {result}".strip()


def format_spf_result(node: ElementTree.Element) -> str:
    domain = text(node, "domain")
    scope = text(node, "scope")
    result = text(node, "result")
    scope_part = f" ({scope})" if scope else ""
    return f"{domain}{scope_part}: {result}".strip()


def summarize_sources(records: Iterable[dict[str, str]]) -> list[dict[str, str | int]]:
    by_ip: dict[str, dict[str, str | int]] = defaultdict(lambda: {
        "source_ip": "",
        "messages": 0,
        "reports": 0,
        "disposition": "",
        "header_from": "",
    })
    seen_report_ip: set[tuple[str, str]] = set()

    for record in records:
        source_ip = record["source_ip"] or "Unknown"
        bucket = by_ip[source_ip]
        bucket["source_ip"] = source_ip
        bucket["messages"] += int(record["count"] or 0)
        bucket["disposition"] = record["disposition"]
        bucket["header_from"] = record["header_from"]
        key = (record["report_id"], source_ip)
        if key not in seen_report_ip:
            seen_report_ip.add(key)
            bucket["reports"] += 1

    return sorted(by_ip.values(), key=lambda item: int(item["messages"]), reverse=True)


def summarize_headers(records: Iterable[dict[str, str]]) -> list[dict[str, str | int]]:
    by_header: dict[str, dict[str, str | int]] = defaultdict(lambda: {
        "header_from": "",
        "pass": 0,
        "fail": 0,
        "total": 0,
        "rows": 0,
    })

    for record in records:
        header_from = (record.get("header_from") or record.get("domain") or "(blank)").strip() or "(blank)"
        count = int(record.get("count") or 0)
        dkim_aligned = (record.get("dkim_aligned") or "").strip().lower()
        spf_aligned = (record.get("spf_aligned") or "").strip().lower()
        passed = dkim_aligned == "pass" or spf_aligned == "pass"

        bucket = by_header[header_from]
        bucket["header_from"] = header_from
        bucket["total"] += count
        bucket["rows"] += 1
        if passed:
            bucket["pass"] += count
        else:
            bucket["fail"] += count

    return sorted(by_header.values(), key=lambda item: int(item["total"]), reverse=True)


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_html(
    report_summaries: list[dict[str, str]],
    records: list[dict[str, str]],
    source_summary: list[dict[str, str | int]],
    header_summary: list[dict[str, str | int]],
) -> str:
    total_messages = sum(int(record["count"] or 0) for record in records)
    fail_count = sum(int(record["count"] or 0) for record in records if record["disposition"] not in {"none", "pass"})
    distinct_ips = len({record["source_ip"] for record in records if record["source_ip"]})
    domains = sorted({record["header_from"] or record["domain"] for record in records if record["header_from"] or record["domain"]})

    cards = [
        ("Reports", str(len(report_summaries))),
        ("Rows", str(len(records))),
        ("Messages", f"{total_messages:,}"),
        ("Distinct IPs", str(distinct_ips)),
        ("Messages with action", f"{fail_count:,}"),
    ]

    report_rows = "\n".join(
        f"<tr><td>{escape(summary['org_name'])}</td><td>{escape(summary['domain'])}</td><td>{escape(summary['date_begin'])}</td><td>{escape(summary['date_end'])}</td><td>{escape(summary['p'])}</td><td>{escape(summary['source_file'])}</td></tr>"
        for summary in report_summaries
    )
    source_rows = "\n".join(
        f"<tr><td>{escape(str(item['source_ip']))}</td><td>{item['messages']:,}</td><td>{item['reports']}</td><td>{escape(str(item['disposition']))}</td><td>{escape(str(item['header_from']))}</td></tr>"
        for item in source_summary[:100]
    )
    header_rows = "\n".join(
        f"<tr><td>{escape(str(item['header_from']))}</td><td>{item['pass']:,}</td><td>{item['fail']:,}</td><td>{item['total']:,}</td><td>{item['rows']}</td></tr>"
        for item in header_summary
    )
    record_rows = "\n".join(
        f"<tr><td>{escape(record['source_ip'])}</td><td>{int(record['count'] or 0):,}</td><td>{escape(record['disposition'])}</td><td>{escape(record['header_from'])}</td><td>{escape(record['auth_dkim'])}</td><td>{escape(record['auth_spf'])}</td><td>{escape(record['source_file'])}</td></tr>"
        for record in sorted(records, key=lambda item: int(item['count'] or 0), reverse=True)[:250]
    )
    domain_pills = "".join(f"<span>{escape(domain)}</span>" for domain in domains[:20]) or "<span>No domains found</span>"
    summary_cards = "".join(
        f"<article class=\"card\"><h2>{escape(label)}</h2><strong>{escape(value)}</strong></article>"
        for label, value in cards
    )

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>DMARC Report Viewer</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f5f1e8;
      --panel: #fffdf8;
      --ink: #1d1b18;
      --muted: #6e655b;
      --line: #ded3c3;
      --accent: #0d6b6b;
      --accent-soft: #d9efef;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: Georgia, "Times New Roman", serif; color: var(--ink); background: radial-gradient(circle at top left, #fff6db, var(--bg) 45%), linear-gradient(180deg, #fdf9f2, var(--bg)); }}
    main {{ max-width: 1200px; margin: 0 auto; padding: 32px 20px 56px; }}
    header {{ margin-bottom: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: clamp(2rem, 4vw, 3.4rem); line-height: 1; }}
    p {{ margin: 0; color: var(--muted); }}
    .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 24px 0; }}
    .card {{ background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 16px; box-shadow: 0 10px 30px rgba(85, 68, 46, 0.08); }}
    .card h2 {{ margin: 0 0 8px; font-size: 0.95rem; color: var(--muted); font-weight: normal; }}
    .card strong {{ font-size: 1.7rem; }}
    .pill-row {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 28px; }}
    .pill-row span {{ background: var(--accent-soft); color: var(--accent); padding: 8px 12px; border-radius: 999px; font-size: 0.95rem; }}
    section {{ background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 18px; margin-bottom: 18px; box-shadow: 0 10px 30px rgba(85, 68, 46, 0.08); }}
    section h2 {{ margin: 0 0 12px; font-size: 1.2rem; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.95rem; }}
    th, td {{ text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }}
    th {{ color: var(--muted); font-weight: normal; }}
    .table-wrap {{ overflow-x: auto; }}
    footer {{ margin-top: 20px; color: var(--muted); font-size: 0.92rem; }}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>DMARC Report Viewer</h1>
      <p>Readable local dashboard for aggregate DMARC XML reports. Generated {escape(generated_at)}.</p>
    </header>
    <div class=\"cards\">{summary_cards}</div>
    <div class=\"pill-row\">{domain_pills}</div>
    <section>
      <h2>Reports</h2>
      <div class=\"table-wrap\"><table><thead><tr><th>Org</th><th>Domain</th><th>Start</th><th>End</th><th>Policy</th><th>Source file</th></tr></thead><tbody>{report_rows}</tbody></table></div>
    </section>
        <section>
            <h2>Pass / Fail by Header From</h2>
            <div class="table-wrap"><table><thead><tr><th>Header From</th><th>Pass</th><th>Fail</th><th>Total</th><th>Rows</th></tr></thead><tbody>{header_rows}</tbody></table></div>
        </section>
    <section>
      <h2>Top Sending Sources</h2>
      <div class=\"table-wrap\"><table><thead><tr><th>Source IP</th><th>Messages</th><th>Reports</th><th>Disposition</th><th>Header From</th></tr></thead><tbody>{source_rows}</tbody></table></div>
    </section>
    <section>
      <h2>Largest Rows</h2>
      <div class=\"table-wrap\"><table><thead><tr><th>Source IP</th><th>Messages</th><th>Disposition</th><th>Header From</th><th>DKIM</th><th>SPF</th><th>Source file</th></tr></thead><tbody>{record_rows}</tbody></table></div>
    </section>
    <footer>CSV exports are generated alongside this HTML file for spreadsheet review.</footer>
  </main>
</body>
</html>
"""


def escape(value: str) -> str:
    return html.escape(value or "")


def main() -> int:
    args = parse_args()
    input_path = Path(args.input_path).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input path not found: {input_path}")

    payloads = discover_xml_payloads(input_path)
    if not payloads:
        raise SystemExit("No XML, .gz, or .zip DMARC reports found.")

    report_summaries: list[dict[str, str]] = []
    records: list[dict[str, str]] = []
    failures: list[str] = []
    for label, payload in payloads:
        try:
            report_records, summary = parse_report(label, payload)
        except ElementTree.ParseError as exc:
            failures.append(f"{label}: {exc}")
            continue
        report_summaries.append(summary)
        records.extend(report_records)

    if not records:
        raise SystemExit("No DMARC records could be parsed from the supplied reports.")

    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else (
        input_path / "dmarc-output" if input_path.is_dir() else input_path.parent / "dmarc-output"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    sources = summarize_sources(records)
    headers = summarize_headers(records)
    html_path = output_dir / "dmarc-report.html"
    records_path = output_dir / "dmarc-records.csv"
    sources_path = output_dir / "dmarc-sources.csv"

    html_path.write_text(build_html(report_summaries, records, sources, headers), encoding="utf-8")
    write_csv(records_path, records, [
        "source_file", "org_name", "report_id", "date_begin", "date_end", "domain", "adkim", "aspf", "p", "sp", "pct",
        "source_ip", "count", "disposition", "dkim_aligned", "spf_aligned", "header_from", "envelope_to",
        "envelope_from", "auth_dkim", "auth_spf",
    ])
    write_csv(sources_path, sources, ["source_ip", "messages", "reports", "disposition", "header_from"])

    print(f"Parsed reports: {len(report_summaries)}")
    print(f"Parsed rows: {len(records)}")
    print(f"HTML: {html_path}")
    print(f"Records CSV: {records_path}")
    print(f"Sources CSV: {sources_path}")
    if failures:
        print("Skipped files:")
        for failure in failures:
            print(f"- {failure}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())