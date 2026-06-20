import openpyxl

PATH = r"c:\Users\satog\OneDrive\Desktop\dengizek\gbsoft-fiyat-modeli.xlsx"
wb = openpyxl.load_workbook(PATH)
BAD = chr(92) + "$"  # backslash-dollar typo from Python \$ in strings
fixed = 0
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            v = cell.value
            if isinstance(v, str) and BAD in v:
                cell.value = v.replace(BAD, "$")
                fixed += 1
wb.save(PATH)
print("fixed cells:", fixed)
