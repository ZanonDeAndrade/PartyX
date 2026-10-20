"""
Textos legais do evento privado (D-92): a release com a lista de autorizados (migração 0019 na tag) só sobe com a Política de
Privacidade e os Termos de Uso que falam dela. A Política precisa dizer que a lista e as solicitações são tratadas e por quanto tempo
(6 meses depois do Evento); os Termos precisam ter a cláusula do Evento privado e dizer que a transferência, nele, só vale para conta
autorizada. Chamado pelo `deploy.sh conferir` com o texto DA TAG. As versões mínimas são as da proposta
(docs/registros/evento-privado-textos-propostos.md); se a PartyX aprovar outra numeração, ajuste MIN_PRIVACY e MIN_TERMS.

Uso: python3 -I infra/producao/textos-privado.py <privacidade.txt> <termos.txt> <PRIVACY_VERSION> <TERMS_VERSION>
Sai com 1 e explica cada problema; 0 quando tudo confere.
"""
import re
import sys

MIN_PRIVACY = (1, 3)
MIN_TERMS = (1, 6)
PRIVACY_LIST = re.compile(r"Eventos? privados?.*lista", re.IGNORECASE | re.DOTALL)
PRIVACY_RETENTION = re.compile(r"Eventos? privados?:?[^\n]*6 meses após o Evento", re.IGNORECASE)
TERMS_CLAUSE = re.compile(r"^Evento privado:", re.IGNORECASE | re.MULTILINE)
TERMS_TRANSFER = re.compile(r"Em Evento privado, a transferência só", re.IGNORECASE)


def version(text):
    try:
        return tuple(int(x) for x in text.strip().split("."))
    except ValueError:
        return None


def problems(privacy, terms, privacy_version, terms_version):
    out = []
    pv = version(privacy_version)
    if pv is None or pv < MIN_PRIVACY:
        out.append(f"PRIVACY_VERSION={privacy_version or '(vazio)'}: a release do evento privado exige a Política de Privacidade 1.3 ou posterior")
    tv = version(terms_version)
    if tv is None or tv < MIN_TERMS:
        out.append(f"TERMS_VERSION={terms_version or '(vazio)'}: a release do evento privado exige os Termos de Uso 1.6 ou posterior")
    if not PRIVACY_LIST.search(privacy):
        out.append("a Política de Privacidade não fala da lista de autorizados dos eventos privados")
    if not PRIVACY_RETENTION.search(privacy):
        out.append("a Política de Privacidade não diz que a lista é apagada 6 meses após o Evento")
    if not TERMS_CLAUSE.search(terms):
        out.append("os Termos de Uso não têm a cláusula do Evento privado")
    if not TERMS_TRANSFER.search(terms):
        out.append("os Termos de Uso não dizem que a transferência em Evento privado só vale para conta autorizada")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding="utf-8") as f:
        privacy = f.read()
    with open(sys.argv[2], encoding="utf-8") as f:
        terms = f.read()
    found = problems(privacy, terms, sys.argv[3], sys.argv[4])
    for p in found:
        print(f"Recuso: {p}.", file=sys.stderr)
    sys.exit(1 if found else 0)
