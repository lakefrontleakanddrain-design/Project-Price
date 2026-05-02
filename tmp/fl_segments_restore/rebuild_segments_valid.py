import csv, os, re

source = r"J:\My Drive\OLD FILES\Marketing\COMPLETE FLORIDA REALTO LIST.csv"
local_dir = r"C:\Project-Price\tmp\fl_segments_restore"
os.makedirs(local_dir, exist_ok=True)

segments = {
    "FL_Panhandle_Master.csv": {"prefixes": ("324", "325"), "region": "the Panhandle"},
    "FL_South_Luxury_Master.csv": {"prefixes": ("330", "331", "332", "333", "334"), "region": "South Florida"},
    "FL_Central_Master.csv": {"prefixes": ("327", "328", "335", "336", "337", "347"), "region": "the Orlando/Tampa area"},
}

out_rows = {k: [] for k in segments}
seen_emails = set()

def proper_case(s):
    s = (s or "").strip().lower()
    return " ".join(p[:1].upper() + p[1:] for p in s.split()) if s else ""

with open(source, "r", encoding="utf-8", errors="replace", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        if (row.get("License Status") or "").strip() != "VALID":
            continue
        email = (row.get("Email Address") or "").strip()
        if not email:
            continue
        key = email.lower()
        if key in seen_emails:
            continue
        seen_emails.add(key)

        zip_digits = re.sub(r"\D", "", (row.get("Business Zip") or ""))
        base = {
            "First Name": proper_case(row.get("First Name")),
            "Email Address": email,
            "Business City": proper_case(row.get("Business City")),
        }

        for fname, cfg in segments.items():
            if zip_digits.startswith(cfg["prefixes"]):
                rec = dict(base)
                rec["Custom_Variable_1"] = cfg["region"]
                out_rows[fname].append(rec)

for fname in segments:
    path = os.path.join(local_dir, fname)
    with open(path, "w", encoding="utf-8", newline="") as wf:
        w = csv.DictWriter(wf, fieldnames=["First Name", "Email Address", "Business City", "Custom_Variable_1"])
        w.writeheader()
        w.writerows(out_rows[fname])
    print(f"{fname}={len(out_rows[fname])}")
