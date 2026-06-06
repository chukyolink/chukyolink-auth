// SPDX-FileCopyrightText: 2026 KATO Hayate <dev@hayatek.jp>
// SPDX-License-Identifier: AGPL-3.0-only

import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

import { defaultHttpHeaders, handleSamlResponse } from './common.ts';
import { hasShibSession } from './shib.ts';


const ALBO_LOGIN_URL = 'https://albo.chukyo-u.ac.jp/api/saml/login';
const ALBO_LOGOUT_URL = 'https://albo.chukyo-u.ac.jp/api/auth/logout';


/**
 * shib.chukyo-u.ac.jpのログインセッションを利用してALBOにログインする。
 *
 * @param cookieJar - CookieJar
 */
export async function loginAlboViaShib(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);

  if (!await hasShibSession(cookieJar)) {
    throw new Error('No valid Shibboleth session found');
  }

  const response = await cfetch(ALBO_LOGIN_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to initiate login: ${response.statusText}`);
  }

  await handleSamlResponse(await response.text(), cookieJar);
}


/**
 * ALBOからログアウトする。
 *
 * @param cookieJar - CookieJar
 * @throws ログアウトに失敗した場合
 */
export async function logoutAlbo(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);
  const response = await cfetch(ALBO_LOGOUT_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to logout: ${response.statusText}`);
  }
}
