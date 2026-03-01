from pyxlsb import open_workbook

print("Opening workbook...")
with open_workbook('YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb') as wb:
    print("Opening sheet...")
    with wb.get_sheet('OPERACION') as sheet:
        rows = []
        count = 0
        for row in sheet.rows():
            count += 1
            # extract basic row data
            r = []
            for c in row:
                if c is None:
                    continue
                val = c.v
                f = c.f
                if f:
                    val = f"[{val} | F: {f}]"
                r.append(val)
                
            if any(x is not None and x != '' for x in r):
                rows.append((count, r))
                if len(rows) > 100:
                    rows.pop(0)

        with open("output2.txt", "w", encoding="utf-8") as f:
            f.write("\nLast 100 non-empty rows with formulas:\n")
            for ri, r in rows:
                f.write(f"Row {ri}: {r}\n")
