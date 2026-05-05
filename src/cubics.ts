// SPDX-FileCopyrightText: 2026 KATO Hayate <dev@hayatek.jp>
// SPDX-License-Identifier: AGPL-3.0-only

import fetchCookie from 'fetch-cookie';

import { defaultHttpHeaders, handleSamlResponse } from './common.ts';
import { hasShibSession } from './shib.ts';

import type { CookieJar } from 'tough-cookie';


const CUBICS_LOGIN_URL = 'https://cubics-as.chukyo-u.ac.jp/unias/UnSSOLoginControl2';


/**
 * shib.chukyo-u.ac.jpのログインセッションを利用してCUBICSにログインする。
 *
 * @param cookieJar - CookieJar
 */
export async function loginCubicsViaShib(cookieJar: CookieJar): Promise<void> {
  const cfetch = fetchCookie(fetch, cookieJar);

  if (!await hasShibSession(cookieJar)) {
    throw new Error('No valid Shibboleth session found');
  }

  const response = await cfetch(CUBICS_LOGIN_URL, { headers: { ...defaultHttpHeaders, 'Accept': 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to initiate login: ${response.statusText}`);
  }

  await handleSamlResponse(await response.text(), cookieJar);
}
