"""Builds the submission zip DawarAhmed_24i2533_Project.zip in the folders the PDF asks for
(Section 13): Create-DW, Mesh-Join, Queries-DW, Data, Project-Report, ReadMe.

Run it from the project folder after the final run and after exporting the report PDF from Word:
    python make_submission.py
The newest Project-Report*.docx and .pdf in the report folder are used (the skeleton is skipped).
"""

import glob
import os
import sys
import zipfile

NAME = "DawarAhmed_24i2533_Project"
ROOT = os.path.dirname(os.path.abspath(__file__))


#first path that exists, so the script works whether a file sits in the root or in a subfolder
def first(*paths):
    for p in paths:
        full = os.path.join(ROOT, p)
        if os.path.isfile(full):
            return full
    return None


#newest report file of one type, skipping the skeleton
def newest_report(ext):
    files = [f for f in glob.glob(os.path.join(ROOT, "report", "Project-Report*" + ext))
             if "skeleton" not in os.path.basename(f).lower()]
    return max(files, key=os.path.getmtime) if files else None


def main():
    plan = []      #(source file, path inside the zip)
    missing = []

    def put(src, dest, required=True):
        if src and os.path.isfile(src):
            plan.append((src, f"{NAME}/{dest}"))
        elif required:
            missing.append(dest)

    #1. Create-DW and 3. Queries-DW
    put(first("sql/Create-DW.sql"), "Create-DW/Create-DW.sql")
    put(first("sql/Queries-DW.sql"), "Queries-DW/Queries-DW.sql")

    #2. Mesh-Join: the Python project (program, tests, control room)
    for f in sorted(glob.glob(os.path.join(ROOT, "src", "*.py"))):
        put(f, "Mesh-Join/src/" + os.path.basename(f))
    for folder, _, names in os.walk(os.path.join(ROOT, "app")):
        if "__pycache__" in folder:
            continue
        for n in sorted(names):
            src = os.path.join(folder, n)
            put(src, "Mesh-Join/" + os.path.relpath(src, ROOT).replace(os.sep, "/"))
    put(first("requirements.txt"), "Mesh-Join/requirements.txt")
    put(first("Start Control Room.bat"), "Mesh-Join/Start Control Room.bat", required=False)

    #4. Data: the three files written by main.py and the data note
    for n in ("online_sales_stream.csv", "customer_master_data.csv", "product_master_data.csv"):
        put(first(n, "data/" + n), "Data/" + n)
    put(first("data/Data_Note.txt", "Data_Note.txt"), "Data/Data_Note.txt")

    #5. Project-Report: the newest report (docx and pdf) and its figures
    docx, pdf = newest_report(".docx"), newest_report(".pdf")
    put(docx, "Project-Report/Project-Report.docx")
    put(pdf, "Project-Report/Project-Report.pdf")
    for n in ("schema_diagram.png", "architecture.png", "meshjoin_inside.png"):
        put(first("report/" + n), "Project-Report/" + n, required=False)

    #6. ReadMe
    put(first("README.md"), "ReadMe/README.md")
    put(first("README.pdf"), "ReadMe/README.pdf", required=False)

    if missing:
        print("Missing (the zip was NOT made):")
        for m in missing:
            print("   ", m)
        sys.exit(1)

    out = os.path.join(ROOT, NAME + ".zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for src, dest in plan:
            z.write(src, dest)

    print(f"Written {out}")
    print(f"{len(plan)} files, {os.path.getsize(out) / 1e6:.1f} MB")
    print(f"Report used: {os.path.basename(pdf)} and {os.path.basename(docx)}")
    folders = {}
    for _, dest in plan:
        top = dest.split("/")[1]
        folders[top] = folders.get(top, 0) + 1
    for top in ("Create-DW", "Mesh-Join", "Queries-DW", "Data", "Project-Report", "ReadMe"):
        print(f"  {top:<15} {folders.get(top, 0)} files")


if __name__ == "__main__":
    main()
