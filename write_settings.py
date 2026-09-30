import shutil
shutil.copy('/opt/erp1/src/app/settings/page.tsx.bak', '/opt/erp1/src/app/settings/page.tsx')
print("restored ok, lines:", len(open('/opt/erp1/src/app/settings/page.tsx').readlines()))
