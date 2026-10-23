#!/usr/bin/env python3
"""Copia docs/traducciones/errores_nuevos/*.json dentro de docs/traducciones/errores.json
y agrega las claves "error.<codigo>" a cada js/lang/<idioma>.js (después de la última línea "error.").
Uso: python3 tools/fusionar_errores.py   (se puede correr varias veces: no duplica)."""
import json, glob, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
base_p = os.path.join(R, 'docs/traducciones/errores.json')
base = json.load(open(base_p, encoding='utf-8'))
idiomas = [k for k in base if not k.startswith('_')]
nuevos = sorted(glob.glob(os.path.join(R, 'docs/traducciones/errores_nuevos/*.json')))
agregados = {i: {} for i in idiomas}
for p in nuevos:
    d = json.load(open(p, encoding='utf-8'))
    for k, v in d.get('_codigos', {}).items(): base['_codigos'].setdefault(k, v)
    for i in idiomas:
        for k, v in d.get(i, {}).items():
            if k not in base[i]:
                base[i][k] = v
            agregados[i][k] = base[i][k]
json.dump(base, open(base_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(base_p, 'a').write('\n')
for i in idiomas:
    lp = os.path.join(R, 'js/lang', i + '.js')
    if not os.path.exists(lp): continue
    s = open(lp, encoding='utf-8').read()
    falta = [(k, v) for k, v in agregados[i].items() if ('"error.%s"' % k) not in s]
    if not falta: continue
    lineas = s.split('\n')
    ult = max(n for n, l in enumerate(lineas) if l.strip().startswith('"error.'))
    ind = re.match(r'\s*', lineas[ult]).group(0)
    if not lineas[ult].rstrip().endswith(','): lineas[ult] = lineas[ult].rstrip() + ','
    nuevas = [ind + json.dumps('error.' + k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ',' for k, v in falta]
    lineas[ult + 1:ult + 1] = nuevas
    open(lp, 'w', encoding='utf-8').write('\n'.join(lineas))
    print(i, len(falta), 'códigos nuevos')
