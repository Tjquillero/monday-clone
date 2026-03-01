import pandas as pd
df = pd.read_excel('YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb', sheet_name='OPERACION', engine='pyxlsb')
print("Reading bottom 40 rows...")
print(df.tail(40).to_string())
