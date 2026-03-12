import pandas as pd
import json

file_path = 'YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb'
df = pd.read_excel(file_path, sheet_name='CONTROL COSTOS MTR Y  PRECIOS', engine='pyxlsb')

in_acta_section = False
acta_items = []
for index, row in df.iterrows():
    c2 = str(row.iloc[1]).strip()
    c3 = str(row.iloc[2]).strip()
    c4 = str(row.iloc[3]).strip()
    
    if "CUADRO DE REVISORÍA" in c3:
        break
        
    if "CONTRALORA" in c3 or "VALOR ACTA FACTURADO" in c3:
        in_acta_section = True
        
    if in_acta_section and len(c3) > 10 and c2 != 'nan':
        acta_items.append({'index': index, 'code': c2, 'desc': c3, 'unidad': c4})

print(f"Total acta items: {len(acta_items)}")
with open('acta_excel_items.json', 'w', encoding='utf-8') as f:
    json.dump(acta_items, f, indent=2, ensure_ascii=False)
