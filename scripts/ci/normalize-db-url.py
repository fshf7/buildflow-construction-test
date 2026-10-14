#!/usr/bin/env python3
"""Строка подключения из секрета → URL с закодированным паролем (спецсимволы @ # / ? : в пароле).

Читает переменную окружения RAW_DB_URL, печатает маску для GitHub Actions и записывает DB_URL в
$GITHUB_ENV. Само значение в stdout не выводится. Хост — после ПОСЛЕДНЕГО «@», пользователь — до
первого «:» в userinfo; уже закодированный пароль не кодируется повторно.
"""
import os
import sys
from urllib.parse import quote, unquote

raw = os.environ.get("RAW_DB_URL", "").strip()
scheme, sep, rest = raw.partition("://")
if not sep or scheme not in ("postgres", "postgresql") or "@" not in rest:
    sys.exit("Строка подключения должна иметь вид postgresql://пользователь:пароль@хост:порт/база")
userinfo, _, hostpart = rest.rpartition("@")
user, has_pass, password = userinfo.partition(":")
userinfo = quote(unquote(user), safe="") + (":" + quote(unquote(password), safe="") if has_pass else "")
url = f"{scheme}://{userinfo}@{hostpart}"

print(f"::add-mask::{quote(unquote(password), safe='')}")
print(f"::add-mask::{url}")
with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env:
    env.write(f"DB_URL={url}\n")
# Структура без секрета — для разбора ошибок подключения.
host, _, rest_path = hostpart.partition("/")
print(f"Строка подключения подготовлена: пользователь {unquote(user)}, хост {host}, база {rest_path or '-'}, "
      f"пароль {len(unquote(password))} симв. (значение скрыто).")
