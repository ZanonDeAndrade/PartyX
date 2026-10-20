"""
Textos legais do evento privado (D-92): a release com a lista de autorizados (migração 0019 na tag) só sobe com a Política de
Privacidade, os Termos de Uso e a Política de Cancelamento que falam dela. A Privacidade precisa dizer que a lista e as solicitações são
tratadas e por quanto tempo (6 meses depois do Evento); os Termos precisam ter a cláusula do Evento privado; os Termos e a Política de
Cancelamento precisam dizer que a transferência, nele, só vale para conta autorizada. Chamado pelo `deploy.sh conferir` com o texto DA
TAG. Versões aprovadas pelo Bernardo em 20/10/2026 (docs/registros/evento-privado-textos-propostos.md): Privacidade 1.3, Termos 1.6 e
Cancelamento 1.2.

Uso: python3 -I infra/producao/textos-privado.py <privacidade.txt> <termos.txt> <cancelamento.txt> <PRIVACY_VERSION> <TERMS_VERSION> <CANCELLATION_VERSION>
Sai com 1 e explica cada problema; 0 quando tudo confere.
"""
import re
import sys

MIN_PRIVACY = (1, 3)
MIN_TERMS = (1, 6)
MIN_CANCELLATION = (1, 2)
PRIVACY_LIST = re.compile(r"Eventos? privados?.*lista", re.IGNORECASE | re.DOTALL)
PRIVACY_RETENTION = re.compile(r"Eventos? privados?:?[^\n]*6 meses após o Evento", re.IGNORECASE)
TERMS_CLAUSE = re.compile(r"^Evento privado:", re.IGNORECASE | re.MULTILINE)
TRANSFER = re.compile(r"Em Evento privado, a transferência só", re.IGNORECASE)


def version(text):
    try:
        return tuple(int(x) for x in text.strip().split("."))
    except ValueError:
        return None


def problems(privacy, terms, cancellation, privacy_version, terms_version, cancellation_version):
    out = []
    pv = version(privacy_version)
    if pv is None or pv < MIN_PRIVACY:
        out.append(f"PRIVACY_VERSION={privacy_version or '(vazio)'}: a release do evento privado exige a Política de Privacidade 1.3 ou posterior")
    tv = version(terms_version)
    if tv is None or tv < MIN_TERMS:
        out.append(f"TERMS_VERSION={terms_version or '(vazio)'}: a release do evento privado exige os Termos de Uso 1.6 ou posterior")
    cv = version(cancellation_version)
    if cv is None or cv < MIN_CANCELLATION:
        out.append(f"CANCELLATION_VERSION={cancellation_version or '(vazio)'}: a release do evento privado exige a Política de Cancelamento 1.2 ou posterior")
    if not PRIVACY_LIST.search(privacy):
        out.append("a Política de Privacidade não fala da lista de autorizados dos eventos privados")
    if not PRIVACY_RETENTION.search(privacy):
        out.append("a Política de Privacidade não diz que a lista é apagada 6 meses após o Evento")
    if not TERMS_CLAUSE.search(terms):
        out.append("os Termos de Uso não têm a cláusula do Evento privado")
    if not TRANSFER.search(terms):
        out.append("os Termos de Uso não dizem que a transferência em Evento privado só vale para conta autorizada")
    if not TRANSFER.search(cancellation):
        out.append("a Política de Cancelamento não diz que a transferência em Evento privado só vale para conta autorizada")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 7:
        sys.exit(__doc__)
    texts = []
    for name in sys.argv[1:4]:
        with open(name, encoding="utf-8") as f:
            texts.append(f.read())
    found = problems(*texts, *sys.argv[4:7])
    for p in found:
        print(f"Recuso: {p}.", file=sys.stderr)
    sys.exit(1 if found else 0)
