// SPDX-FileCopyrightText: 2026 KATO Hayate <dev@hayatek.jp>
// SPDX-License-Identifier: AGPL-3.0-only

import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

import { defaultHttpHeaders, handleSamlResponse } from './common.ts';
import { hasShibSession } from './shib.ts';


const MANABO_LOGIN_URL = 'https://MaNaBo.cnc.chukyo-u.ac.jp/auth/shibboleth/';
const MANABO_LOGOUT_URL = 'https://manabo.cnc.chukyo-u.ac.jp/logout/';


/**
 * shib.chukyo-u.ac.jpのログインセッションを利用してMaNaBoにログインする。
 *
 * @param cookieJar - CookieJar
 */
export async function loginManaboViaShib(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);

  if (!await hasShibSession(cookieJar)) {
    throw new Error('No valid Shibboleth session found');
  }

  const response = await cfetch(MANABO_LOGIN_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to initiate login: ${response.statusText}`);
  }

  await handleSamlResponse(await response.text(), cookieJar);
}


/**
 * MaNaBoからログアウトする。
 *
 * @param cookieJar - CookieJar
 * @throws ログアウトに失敗した場合
 */
export async function logoutManabo(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);
  const response = await cfetch(MANABO_LOGOUT_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to logout: ${response.statusText}`);
  }
}
