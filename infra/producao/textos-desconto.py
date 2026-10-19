"""
Termos de Uso do desconto por promoter (D-91): a release que dá desconto pelo código do promoter (migração 0018 na tag) só sobe com os
Termos de Uso 1.5 ou posterior, que falam do desconto. Os Termos anteriores diziam que o código "não dá desconto". Chamado pelo
`deploy.sh conferir` com o texto DA TAG.

Uso: python3 -I infra/producao/textos-desconto.py <termos.txt> <TERMS_VERSION>
Sai com 1 e explica cada problema; 0 quando tudo confere.
"""
import re
import sys

MIN_TERMS = (1, 5)
OLD_TERMS = re.compile(r"não dá desconto", re.IGNORECASE)
CODE_PARAGRAPH = re.compile(r"^Código de divulgação:.*pode dar um desconto", re.IGNORECASE | re.MULTILINE)


def version(text):
    try:
        return tuple(int(x) for x in text.strip().split("."))
    except ValueError:
        return None


def problems(terms, terms_version):
    out = []
    tv = version(terms_version)
    if tv is None or tv < MIN_TERMS:
        out.append(f"TERMS_VERSION={terms_version or '(vazio)'}: a release do desconto por promoter exige os Termos de Uso 1.5 ou posterior")
    if OLD_TERMS.search(terms):
        out.append("os Termos de Uso ainda dizem que o código de promoter não dá desconto")
    if not CODE_PARAGRAPH.search(terms):
        out.append("os Termos de Uso não explicam o desconto do código de divulgação")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        terms = f.read()
    found = problems(terms, sys.argv[2])
    for p in found:
        print(f"Recuso: {p}.", file=sys.stderr)
    sys.exit(1 if found else 0)
