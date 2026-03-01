from pyxlsb import open_workbook
import os, sys

def find_xlsb():
    for f in os.listdir('.'):
        if f.lower().endswith('.xlsb') and 'JUNIO' in f.upper():
            return f
    return None

file_path = find_xlsb()
if not file_path:
    print("XLSB file NOT found.")
    sys.exit(1)

output_file = 'excel_full_rows.txt'
with open_workbook(file_path) as wb:
    sheet_name = 'OPERACION'
    with wb.get_sheet(sheet_name) as sheet:
        with open(output_file, 'w', encoding='utf-8') as f:
            for i, r in enumerate(sheet.rows()):
                if i >= 150 and i < 400:
                    vals = [str(c.v) if c.v is not None else "" for c in r]
                    f.write(f"Row {i}: {vals}\n")
                if i >= 400:
                    break
print(f"Done. Output in {output_file}")
