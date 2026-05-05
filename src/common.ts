// SPDX-FileCopyrightText: 2026 KATO Hayate <dev@hayatek.jp>
// SPDX-License-Identifier: AGPL-3.0-only

import fetchCookie from 'fetch-cookie';
import { JSDOM } from 'jsdom';

import type { CookieJar } from 'tough-cookie';


/**
 * ACSリクエストの型定義。
 */
interface AcsRequest {
  SAMLResponse: string;
  RelayState: string;
}


/**
 * HTTPリクエストに用いるデフォルトのヘッダー。
 */
export const defaultHttpHeaders = {
  'User-Agent': 'ChukyoLinkAuth/1.2.0 (https://chukyo.link/)',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
};


/**
 * SAMLレスポンスを処理する。
 *
 * @param responseText - パスワード認証APIからのレスポンスのテキスト
 * @param cookieJar - CookieJar
 * @returns 認証が完了した場合はtrueを返し、二段階認証が必要な場合はfalseを返す
 * @throws 認証に失敗した場合
 */
export async function handleSamlResponse(responseText: string, cookieJar: CookieJar): Promise<boolean> {
  const cfetch = fetchCookie(fetch, cookieJar);
  const responseDom = new JSDOM(responseText).window.document;
  const errorElement = responseDom.querySelector('#ldaperror_area');
  if (errorElement) {
    const errorMessage = errorElement.querySelector('p')?.textContent?.trim() || 'Unknown error';
    throw new Error(`Password authentication failed: ${errorMessage}`);
  } else {
    const trackButtonElement = responseDom.querySelector('#btntrackid');
    if (trackButtonElement) {
      const trackId = responseDom.querySelector('label:has(+ #btntrackid)')?.textContent?.trim() || 'Unknown TrackID';
      throw new Error(`Unknown error during password authentication (TrackID: ${trackId})`);
    } else {
      const samlResponse = responseDom.querySelector('input[name="SAMLResponse"]')?.getAttribute('value');
      const relayState = responseDom.querySelector('input[name="RelayState"]')?.getAttribute('value');
      if (samlResponse && relayState) {
        const acsUrl = responseDom
          .querySelector('form[method="post"]:has(input[name="SAMLResponse"])')?.getAttribute('action');
        if (!acsUrl) {
          throw new Error('Failed to handle SAML response: ACS URL not found in form action');
        }
        const acsPayload = { SAMLResponse: samlResponse, RelayState: relayState } satisfies AcsRequest;
        const acsResponse = await cfetch(acsUrl, {
          method: 'POST',
          headers: {
            ...defaultHttpHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html',
          },
          body: new URLSearchParams(acsPayload),
        });
        if (!acsResponse.ok) {
          throw new Error(`Failed to submit SAML response to ACS URL: ${acsResponse.status} ${acsResponse.statusText}`);
        }
        return true; // 認証成功
      }
      return false; // 二段階認証へ進む
    }
  }
}
