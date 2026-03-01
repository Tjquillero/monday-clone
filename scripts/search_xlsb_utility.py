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

print(f"Searching 'UTILIDAD' or 'AIU' in '{file_path}'...")

with open_workbook(file_path) as wb:
    sheet_name = 'OPERACION'
    with wb.get_sheet(sheet_name) as sheet:
        for i, r in enumerate(sheet.rows()):
            vals = [str(c.v) if c.v is not None else "" for c in r]
            row_str = " ".join(vals).upper()
            if 'UTILIDAD' in row_str or 'AIU' in row_str or 'ADMINISTRA' in row_str:
                print(f"Row {i}: {vals}")
