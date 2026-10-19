"""
Textos legais da taxa de serviço (D-90): a release que cobra a taxa só sobe com os Termos de Uso e a Política de Cancelamento que falam
dela. Os textos anteriores (Termos 1.2, Política 1.0) diziam que não havia taxa. Chamado pelo `deploy.sh conferir` com os textos DA TAG.

Uso: python3 -I infra/producao/textos-taxa.py <termos.txt> <cancelamento.txt> <TERMS_VERSION> <CANCELLATION_VERSION>
Sai com 1 e explica cada problema; 0 quando tudo confere.
"""
import re
import sys

MIN_TERMS = (1, 3)
MIN_CANCELLATION = (1, 1)
OLD_TERMS = re.compile(r"não há taxa de conveniência nem taxa de serviço", re.IGNORECASE)
OLD_CANCELLATION = re.compile(r"não há taxa de conveniência", re.IGNORECASE)


def version(text):
    try:
        return tuple(int(x) for x in text.strip().split("."))
    except ValueError:
        return None


def problems(terms, cancellation, terms_version, cancellation_version):
    out = []
    tv, cv = version(terms_version), version(cancellation_version)
    if tv is None or tv < MIN_TERMS:
        out.append(f"TERMS_VERSION={terms_version or '(vazio)'}: a release da taxa exige os Termos de Uso 1.3 ou posterior")
    if cv is None or cv < MIN_CANCELLATION:
        out.append(f"CANCELLATION_VERSION={cancellation_version or '(vazio)'}: a release da taxa exige a Política de Cancelamento 1.1 ou posterior")
    if OLD_TERMS.search(terms):
        out.append("os Termos de Uso ainda dizem que não há taxa de serviço")
    if "taxa de serviço" not in terms.lower():
        out.append("os Termos de Uso não falam da taxa de serviço")
    if OLD_CANCELLATION.search(cancellation):
        out.append("a Política de Cancelamento ainda diz que não há taxa de conveniência")
    if "taxa de serviço" not in cancellation.lower():
        out.append("a Política de Cancelamento não diz que o reembolso devolve a taxa de serviço")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        terms = f.read()
    with open(sys.argv[2], encoding="utf-8") as f:
        cancellation = f.read()
    found = problems(terms, cancellation, sys.argv[3], sys.argv[4])
    for p in found:
        print(f"Recuso: {p}.", file=sys.stderr)
    sys.exit(1 if found else 0)
